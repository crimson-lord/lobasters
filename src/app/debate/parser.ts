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
  const modelContent = rawResponse.content || '';
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
                thinking = formatReasoning(rawResponse[matchingKey]);
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
            thinking = formatReasoning(rawResponse[agentConfig.reasoningField]);
        } 
        
        // Priority 2: Resilient fuzzy search (case-insensitive and common keys)
        if (!thinking) {
            const keys = Object.keys(rawResponse);
            const target = agentConfig.reasoningField?.toLowerCase();
            const matchingKey = keys.find(k => k.toLowerCase() === target);
            if (matchingKey) {
                thinking = formatReasoning(rawResponse[matchingKey]);
            }

            if (!thinking) {
                for (const field of COMMON_REASONING_FIELDS) {
                    const fallbackKey = keys.find(k => k.toLowerCase() === field.toLowerCase());
                    if (fallbackKey) {
                        thinking = formatReasoning(rawResponse[fallbackKey]);
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

  return { thinking, speak: speak ?? '' };
}

function formatReasoning(data: any): string {
    if (typeof data === 'object' && data !== null) {
        return JSON.stringify(data, null, 2);
    }
    return String(data);
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
