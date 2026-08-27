import { ProvingGroundAgentConfig } from "./types";

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
 * A helper to extract content from a given XML-like tag.
 */
function extractTagContent(text: string, startTag: string, endTag: string): string | null {
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

/**
 * Parses the raw text response from a model, which may contain thinking tags.
 * It separates the thinking part from the final response.
 */
export function parseWithThinking(rawResponse: any, agentConfig: ProvingGroundAgentConfig): { clean: string, thinking: string | null } {
    const modelContent = rawResponse.content || '';
    let thinking: string | null = null;
    let clean = modelContent;

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
        else if (agentConfig.reasoningCaptureMethod === 'tags') {
            const { startTag, endTag } = agentConfig;
            thinking = extractTagContent(modelContent, startTag, endTag);
        } else if (agentConfig.reasoningCaptureMethod === 'field') {
            // Try user-configured field
            if (agentConfig.reasoningField && rawResponse[agentConfig.reasoningField]) {
                thinking = formatReasoning(rawResponse[agentConfig.reasoningField]);
            }
            
            // Fuzzy Search
            if (!thinking) {
                const keys = Object.keys(rawResponse);
                const target = agentConfig.reasoningField?.toLowerCase();
                const matchingKey = keys.find(k => k.toLowerCase() === target);
                if (matchingKey) {
                    thinking = formatReasoning(rawResponse[matchingKey]);
                }

                // Resilient Fallback: Try common fields
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

        // 2. Safety Fallback: Check for common tags regardless of mode
        if (!thinking && agentConfig.reasoningCaptureMethod !== 'none') {
            thinking = extractTagContent(modelContent, '<thinking>', '</thinking>') 
                    || extractTagContent(modelContent, '<reasoning>', '</reasoning>')
                    || extractTagContent(modelContent, '<thought>', '</thought>');
        }
    }

    // 3. Clean up the response content
    if (thinking) {
        // Remove tags from content if present
        if (agentConfig.reasoningCaptureMethod === 'tags' || agentConfig.reasoningCaptureMethod === 'all') {
            clean = modelContent.replace(new RegExp(`${escapeRegex(agentConfig.startTag)}[\\s\\S]*?${escapeRegex(agentConfig.endTag)}`, 'g'), '').trim();
        }
        
        // Remove common fallback tags
        clean = clean.replace(/<(thinking|reasoning|thought)>[\s\S]*?<\/\1>/g, '').trim();
    }
    
    return { clean, thinking };
}

function formatReasoning(data: any): string {
    if (typeof data === 'object' && data !== null) {
        return JSON.stringify(data, null, 2);
    }
    return String(data);
}
