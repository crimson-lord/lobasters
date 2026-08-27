'use server';
import { AgentConfig, DebateResponse, Message, AgentID, DebateConfig } from './types';
import { runDebateTurn } from './flows/debate-flow';
import { parseResponse } from './parser';
import OpenAI from 'openai';

/**
 * Fetches a response from the agent model by mapping the global message history
 * into a perspective-specific history for the current agent.
 */
export async function fetchAgentResponse(
  agentConfig: AgentConfig,
  history: Message[],
  prompt: string,
  currentAgentId: AgentID,
  debateConfig: DebateConfig
): Promise<DebateResponse> {
  // Construct the full system prompt for the model
  const fullPrompt = `${agentConfig.systemPrompt}\n\nUSER INSTRUCTION:\n${prompt}`;

  // Map the global history into the specific perspective of this agent
  const agentMessages = history
    .filter(m => !m.intendedFor || m.intendedFor === 'ALL' || m.intendedFor === currentAgentId)
    .map(m => {
      // 1. Handle Tool responses separately
      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.tool_call_id,
          content: m.content
        } as const;
      }

      // 2. Assign Perspective Roles:
      // Current agent is 'assistant', everyone else (including the other agent) is 'user'
      const role = m.author === currentAgentId ? 'assistant' : 'user';
      
      // 3. Handle Content and Nicknames:
      // We ONLY prepend nicknames to the OPPONENT'S messages.
      // We do NOT prepend the nickname to the agent's own past messages (assistant role).
      // This prevents the model from thinking it needs to repeat its own name.
      let content = m.content;
      if (m.author !== 'SYSTEM' && m.author !== currentAgentId) {
        const senderNickname = m.author === 'A'
          ? (debateConfig.agentA.nickname || 'Agent A')
          : (debateConfig.agentB.nickname || 'Agent B');
        content = `${senderNickname}: ${m.content}`;
      }

      return {
        role,
        content,
        // Pass through tool_calls if they were part of this assistant message
        ...(m.rawResponse?.tool_calls ? { tool_calls: m.rawResponse.tool_calls } : {})
      } as any;
    });
  
  // Apply history limit if configured
  const slicedAgentMessages = agentConfig.maxHistory ? agentMessages.slice(-agentConfig.maxHistory) : agentMessages;

  const messagesForApi: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: fullPrompt },
      ...slicedAgentMessages
    ];

  try {
    const rawResponse = await runDebateTurn({
      history: messagesForApi,
      agentConfig,
    });
    
    const parsed = parseResponse(rawResponse, agentConfig);

    return { 
        ...parsed, 
        rawRequest: { messages: messagesForApi, model: agentConfig.modelName, temperature: agentConfig.temperature }, 
        rawResponse 
    };

  } catch (e: any) {
    console.error(`Agent API Error: ${e.message}`, e);
    return {
      thinking: `Encountered an error: ${e.message}`,
      speak: `(An error occurred: ${e.message})`,
      rawRequest: { messages: messagesForApi, model: agentConfig.modelName, error: 'Request was not sent due to error.' },
      rawResponse: { error: e.message, status: e.status },
    };
  }
}
