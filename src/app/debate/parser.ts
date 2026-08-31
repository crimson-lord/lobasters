import { AgentConfig, ParsedDebateResponse } from "./types";

const SPEAK_TAG = 'speak';
const COMMON_REASONING_FIELDS = [
  'reasoning_content',
  'reasoning',
  'thought',
  'private_thinking',
  'inner_monologue',
  'reasoning_details',
  'privatethinking',
  'privatereasoning'
];

/**
 * Parses the raw text response from the model, which is expected
 * to contain thinking and <speak> tags or native reasoning fields.
 */
export function parseResponse(rawResponse: any, agentConfig: AgentConfig): ParsedDebateResponse {
  const modelContent = formatContent(rawResponse?.content);
  let thinking: string | null = null;
  
  // 1. Multi-Step Resilient Search
  if (agentConfig.canThink) {
    // Systematic All-Method Search
    if (agentConfig.reasoningCaptureMethod === 'all') {
        // A. Try all common fields first
        const keys = Object.keys(rawResponse);
        const allPossibleKeys = [agentConfig.reasoningField, ...COMMON_REASONING_FIELDS];
        for (const targetKey of allPossibleKeys) {
            if (!targetKey) continue;
            const matchingKey = keys.find(k => k.toLowerCase() === targetKey.toLowerCase());
            if (matchingKey && rawResponse[matchingKey]) {
                thinking = formatReasoning(rawResponse[matchingKey]) || null;
                break;
            }
        }

        // B. If still no thinking, try custom tags
        if (!thinking) {
            thinking = extractTagContent(modelContent, agentConfig.startTag, agentConfig.endTag);
        }

        // C. Last resort standard tags
        if (!thinking) {
            thinking = extractTagContent(modelContent, '<thinking>', '</thinking>') 
                    || extractTagContent(modelContent, '<reasoning>', '</reasoning>')
                    || extractTagContent(modelContent, '<thought>', '</thought>');
        }
    } 
    // Specific Method Selection
    else if (agentConfig.reasoningCaptureMethod === 'tags') {
        thinking = extractTagContent(modelContent, agentConfig.startTag, agentConfig.endTag);
    } else if (agentConfig.reasoningCaptureMethod === 'field') {
        // Priority 1: User-configured field
        if (agentConfig.reasoningField && rawResponse[agentConfig.reasoningField]) {
            thinking = formatReasoning(rawResponse[agentConfig.reasoningField]) || null;
        } 
        
        // Priority 2: Resilient fuzzy search (case-insensitive and common keys)
        if (!thinking) {
            const keys = Object.keys(rawResponse);
            const target = agentConfig.reasoningField?.toLowerCase();
            const matchingKey = keys.find(k => k.toLowerCase() === target);
            if (matchingKey) {
                thinking = formatReasoning(rawResponse[matchingKey]) || null;
            }

            if (!thinking) {
                for (const field of COMMON_REASONING_FIELDS) {
                    const fallbackKey = keys.find(k => k.toLowerCase() === field.toLowerCase());
                    if (fallbackKey) {
                        thinking = formatReasoning(rawResponse[fallbackKey]) || null;
                        break;
                    }
                }
            }
        }
    }

    // 2. Safety Fallback: Check for common tags even if in Field mode
    if (!thinking && agentConfig.reasoningCaptureMethod !== 'none') {
        thinking = extractTagContent(modelContent, '<thinking>', '</thinking>') 
                || extractTagContent(modelContent, '<reasoning>', '</reasoning>')
                || extractTagContent(modelContent, '<thought>', '</thought>');
    }
  }

  // 3. Extract the spoken part
  let speak = extractTagContent(modelContent, `<${SPEAK_TAG}>`, `</${SPEAK_TAG}>`);

  // If the <speak> tag is missing, assume the whole response is the spoken part.
  if (speak === null) {
    let cleanSpeak = modelContent;
    
    // Remove the thinking tags from the clean text if they exist
    if (thinking && (agentConfig.reasoningCaptureMethod === 'tags' || agentConfig.reasoningCaptureMethod === 'all')) {
      cleanSpeak = cleanSpeak.replace(new RegExp(`${escapeRegex(agentConfig.startTag)}[\\s\\S]*?${escapeRegex(agentConfig.endTag)}`, 'g'), '').trim();
    }
    
    if (thinking) {
        // Also try removing common fallback tags
        cleanSpeak = cleanSpeak.replace(/<(thinking|reasoning|thought)>[\s\S]*?<\/\1>/g, '').trim();
    }

    // Handle cases where the whole response is a tool call
    if (rawResponse.tool_calls && (!cleanSpeak || cleanSpeak.length < 1)) {
        cleanSpeak = '';
    }
    
    speak = cleanSpeak || '';
  }

  const refusal = formatContent(rawResponse?.refusal).trim();
  if (!speak?.trim() && refusal) {
    speak = `Provider refusal: ${refusal}`;
  }

  const hasToolCalls = Array.isArray(rawResponse?.tool_calls) && rawResponse.tool_calls.length > 0;
  const usedReasoningAsSpeech = !hasToolCalls && !speak?.trim() && Boolean(thinking?.trim());

  // Some reasoning models exhaust their completion budget before producing a
  // separate final-content field. A blank Arena turn is worse than preserving
  // the only text the provider returned, so promote that text while retaining
  // the raw payload and an explicit UI notice.
  if (usedReasoningAsSpeech) {
    speak = thinking;
  }

  return { thinking, speak: speak ?? '', usedReasoningAsSpeech };
}

/**
 * Keeps XML/tag reasoning private while still streaming the opponent-visible
 * <speak> section. Plain non-tagged content continues streaming normally.
 * The completed parser remains authoritative and replaces this preview.
 */
export function createVisibleContentDeltaFilter(agentConfig: AgentConfig) {
  if (!agentConfig.canThink || !['tags', 'all'].includes(agentConfig.reasoningCaptureMethod)) {
    return (chunk: string) => chunk;
  }

  const rawPairs = [
    { start: agentConfig.startTag, end: agentConfig.endTag },
    { start: '<thinking>', end: '</thinking>' },
    { start: '<reasoning>', end: '</reasoning>' },
    { start: '<thought>', end: '</thought>' },
  ].filter(pair => pair.start && pair.end);
  const pairs = rawPairs.filter((pair, index) => rawPairs.findIndex(candidate => candidate.start === pair.start) === index);
  const speakStart = '<speak>';
  const speakEnd = '</speak>';
  const candidateStarts = [speakStart, ...pairs.map(pair => pair.start)];
  const longestCandidate = Math.max(...candidateStarts.map(tag => tag.length));
  let mode: 'detect' | 'reasoning' | 'speak' | 'plain' | 'done' = 'detect';
  let activeReasoningEnd = '';
  let pending = '';

  const suffixPrefixLength = (value: string, token: string) => {
    const maximum = Math.min(value.length, token.length - 1);
    for (let length = maximum; length > 0; length--) {
      if (value.endsWith(token.slice(0, length))) return length;
    }
    return 0;
  };

  return (chunk: string) => {
    pending += chunk;
    let visible = '';

    while (pending) {
      if (mode === 'done') {
        pending = '';
        break;
      }
      if (mode === 'plain') {
        visible += pending;
        pending = '';
        break;
      }
      if (mode === 'reasoning') {
        const endIndex = pending.indexOf(activeReasoningEnd);
        if (endIndex === -1) break;
        pending = pending.slice(endIndex + activeReasoningEnd.length);
        mode = 'detect';
        continue;
      }
      if (mode === 'speak') {
        const endIndex = pending.indexOf(speakEnd);
        if (endIndex !== -1) {
          visible += pending.slice(0, endIndex);
          pending = pending.slice(endIndex + speakEnd.length);
          mode = 'done';
          continue;
        }
        const heldLength = suffixPrefixLength(pending, speakEnd);
        const safeLength = pending.length - heldLength;
        visible += pending.slice(0, safeLength);
        pending = pending.slice(safeLength);
        break;
      }

      const whitespaceLength = pending.match(/^\s*/)?.[0].length ?? 0;
      const body = pending.slice(whitespaceLength);
      if (!body) break;
      if (body.startsWith(speakStart)) {
        pending = body.slice(speakStart.length);
        mode = 'speak';
        continue;
      }
      const reasoningPair = pairs.find(pair => body.startsWith(pair.start));
      if (reasoningPair) {
        pending = body.slice(reasoningPair.start.length);
        activeReasoningEnd = reasoningPair.end;
        mode = 'reasoning';
        continue;
      }
      if (candidateStarts.some(tag => tag.startsWith(body))) break;
      if (body.startsWith('<') && body.length < longestCandidate) break;

      mode = 'plain';
    }

    return visible;
  };
}

function formatReasoning(data: any): string {
    if (typeof data === 'string') return data.trim();
    if (typeof data === 'number' || typeof data === 'boolean') return String(data);
    if (Array.isArray(data)) {
      return data.map(formatReasoning).filter(Boolean).join('\n').trim();
    }
    if (typeof data === 'object' && data !== null) {
      if (typeof data.type === 'string' && data.type.toLowerCase().includes('encrypted')) return '';
      let hasTextBearingField = false;
      for (const key of ['text', 'content', 'reasoning', 'summary']) {
        if (key in data) {
          hasTextBearingField = true;
          const formatted = formatReasoning(data[key]);
          if (formatted) return formatted;
        }
      }
      if (hasTextBearingField) return '';
      const nested = Object.entries(data)
        .filter(([key]) => !['id', 'type', 'format', 'index', 'signature'].includes(key))
        .map(([, value]) => formatReasoning(value))
        .filter(Boolean)
        .join('\n')
        .trim();
      return nested || JSON.stringify(data, null, 2);
    }
    return '';
}

function formatContent(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    return data.map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object') {
        const value = (part as Record<string, unknown>).text ?? (part as Record<string, unknown>).content;
        return typeof value === 'string' ? value : '';
      }
      return '';
    }).join('');
  }
  if (data && typeof data === 'object') {
    const value = (data as Record<string, unknown>).text ?? (data as Record<string, unknown>).content;
    return typeof value === 'string' ? value : '';
  }
  return '';
}

/**
 * A helper to extract content from a given XML-like tag.
 * Returns the content of the first matching tag, or null if not found.
 */
function extractTagContent(text: string, startTag: string, endTag:string): string | null {
  if (typeof text !== 'string') return null;
  const start = text.indexOf(startTag);
  if (start === -1) return null;
  const end = text.indexOf(endTag, start);
  if (end === -1) return null;
  return text.substring(start + startTag.length, end).trim();
}

function escapeRegex(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
