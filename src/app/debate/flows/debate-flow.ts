'use server';
import OpenAI from 'openai';
import { AgentConfig, ApiMessage } from '../types';

// Interface for the input to this server action
interface DebateTurnInput {
  history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  agentConfig: AgentConfig;
}

// This function now directly uses the OpenAI SDK and supports streaming
export async function runDebateTurn(input: DebateTurnInput): Promise<any> {
  const { history, agentConfig } = input;

  const apiKey = agentConfig.apiKey || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("No API key found. Please enter your API key in the Arena Settings.");
  }

  // Initialize the OpenAI client with dynamic configuration
  const openai = new OpenAI({
    baseURL: agentConfig.baseURL,
    apiKey: apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://lobasters.vercel.app',
      'X-Title': 'Lobasters',
    },
    dangerouslyAllowBrowser: true,
  });

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

  try {
    // Make the API call to the configured model with streaming enabled
    const stream = await openai.chat.completions.create({
      model: agentConfig.modelName,
      messages: history,
      temperature: agentConfig.temperature,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      max_tokens: agentConfig.maxTokens || 4096,
      stream: true,
      ...(agentConfig.canThink ? { extra_body: { include_reasoning: true } } : {}),
    });

    let accumulatedMessage: any = { role: 'assistant', content: '' };

    for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Iterate over all keys in the delta and accumulate them
        for (const key in delta) {
            if (key === 'content' && typeof delta.content === 'string') {
                if (accumulatedMessage.content === undefined) accumulatedMessage.content = '';
                accumulatedMessage.content += delta.content;
            } else if (key === 'tool_calls' && Array.isArray(delta.tool_calls)) {
                 if (!accumulatedMessage.tool_calls) {
                    accumulatedMessage.tool_calls = [];
                }
                for (const toolCall of delta.tool_calls) {
                    if (toolCall.index >= accumulatedMessage.tool_calls.length) {
                        accumulatedMessage.tool_calls.push(toolCall);
                    } else {
                        const existingCall = accumulatedMessage.tool_calls[toolCall.index];
                        if (toolCall.id) existingCall.id = toolCall.id;
                        if (toolCall.type) existingCall.type = toolCall.type;
                        if (toolCall.function) {
                            if (!existingCall.function) existingCall.function = {};
                            if(toolCall.function.name) existingCall.function.name = (existingCall.function.name || '') + toolCall.function.name;
                            if(toolCall.function.arguments) existingCall.function.arguments = (existingCall.function.arguments || '') + toolCall.function.arguments;
                        }
                    }
                }
            } else if (key !== 'role' && delta[key as keyof typeof delta] !== null) {
                if (accumulatedMessage[key] === undefined) {
                    accumulatedMessage[key] = delta[key as keyof typeof delta];
                } else if (typeof accumulatedMessage[key] === 'string' && typeof delta[key as keyof typeof delta] === 'string') {
                    accumulatedMessage[key] += delta[key as keyof typeof delta];
                }
            }
        }
    }
    
    return accumulatedMessage;

  } catch (error: any) {
    console.error("Error calling OpenAI compatible API: ", error);
    throw new Error(`API call failed: ${error.message}`);
  }
}
