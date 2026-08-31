import OpenAI from 'openai';
import { AgentConfig } from '../types';
import { collectChatCompletion } from '@/lib/chat-stream';

interface DebateTurnInput {
  history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  agentConfig: AgentConfig;
}

// The shared route uses a streaming transport, but Arena collects it silently
// and publishes only the completed response.
export async function runDebateTurn(
  input: DebateTurnInput,
): Promise<{ rawRequest: Record<string, unknown>; rawResponse: any }> {
  const { history, agentConfig } = input;

  const apiKey = agentConfig.apiKey || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("No API key found. Please enter your API key in the Arena Settings.");
  }

  const isOpenRouter = (() => {
    try {
      return new URL(agentConfig.baseURL).hostname.toLowerCase() === 'openrouter.ai';
    } catch {
      return false;
    }
  })();

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

  // Add Give Up tool only if enabled
  if (agentConfig.enableGiveUp) {
    tools.push({
      type: 'function',
      function: {
        name: 'giveUp',
        description: 'Call this function to concede the debate when you are out of arguments or believe the opponent is right. You must provide a reason.',
        parameters: {
          type: 'object',
          properties: {
            reason: {
              type: 'string',
              description: 'A brief explanation for why you are conceding the debate.',
            },
          },
          required: ['reason'],
        },
      },
    });
  }

  // Add Manual Tool
  if (agentConfig.enableManualTool) {
    tools.push({
      type: 'function',
      function: {
        name: 'read_manual',
        description: 'Read your private manual/instructions for this session.',
        parameters: { type: 'object', properties: {} }
      }
    });
  }

  // Add Custom Tools
  agentConfig.customTools.forEach(ct => {
    let params = { type: 'object', properties: {}, required: [] as string[] };
    
    if (ct.parameterSchema) {
        try {
            params = JSON.parse(ct.parameterSchema);
        } catch (e) {
            console.warn(`Failed to parse parameter schema for tool ${ct.name}. Using default empty object.`);
        }
    }

    tools.push({
      type: 'function',
      function: {
        name: ct.name,
        description: ct.description,
        parameters: params as any
      }
    });
  });

  const requestPayload = {
    model: agentConfig.modelName,
    messages: history,
    temperature: agentConfig.temperature,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? 'auto' : undefined,
    max_tokens: agentConfig.maxTokens || 4096,
    // OpenRouter's unified reasoning control is a top-level request field.
    // Other OpenAI-compatible providers vary, so they use the tag protocol or
    // their native default rather than receiving an unsupported vendor field.
    ...(agentConfig.canThink && isOpenRouter
      ? { reasoning: { enabled: true, exclude: false } }
      : {}),
  };

  // Keep the streaming transport for timeout resilience, but collect it
  // silently. Arena publishes only the completed, parsed model response.
  return collectChatCompletion(
    { baseURL: agentConfig.baseURL, apiKey },
    requestPayload,
  );
}
