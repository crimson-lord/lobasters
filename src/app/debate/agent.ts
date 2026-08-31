import { AgentConfig, DebateResponse, Message, AgentID, DebateConfig } from './types';
import { runDebateTurn } from './flows/debate-flow';
import { parseResponse } from './parser';
import { constructResponseProtocol, constructRuntimeGuard } from './utils';
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
  debateConfig: DebateConfig,
  onDelta?: (delta: Record<string, unknown>) => void,
): Promise<DebateResponse> {
  // Researcher prompts remain intact; Lobasters adds a small authoritative
  // runtime guard so transcript text cannot make the two participants swap.
  const fullPrompt = [
    agentConfig.systemPrompt,
    constructRuntimeGuard(currentAgentId, debateConfig, debateConfig.agentIsPro === currentAgentId),
    constructResponseProtocol(debateConfig, currentAgentId),
  ].filter(Boolean).join('\n\n');

  // Map the global history into the specific perspective of this agent
  const agentMessages = history
    .filter(m => !m.isLoading && (!m.intendedFor || m.intendedFor === 'ALL' || m.intendedFor === currentAgentId))
    .map(m => {
      // 1. Handle Tool responses separately
      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.tool_call_id,
          content: m.content
        } as const;
      }

      // Arena-originated updates are control context, not words spoken by a
      // human user. Keeping them as system messages prevents role confusion.
      if (m.author === 'SYSTEM') {
        return {
          role: 'system',
          content: `[ARENA SYSTEM] ${m.content}`,
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
      if (role === 'assistant' && typeof m.rawResponse?.content === 'string') {
        content = m.rawResponse.content;
      }
      if (m.author !== currentAgentId) {
        const senderNickname = m.author === 'A'
          ? (debateConfig.agentA.nickname || 'Agent A')
          : (debateConfig.agentB.nickname || 'Agent B');
        const senderId = m.author as AgentID;
        content = `[OPPONENT — Agent ${senderId} — ${senderNickname}]\n${m.content}`;
      }

      const reasoningContext = role !== 'assistant'
        ? {}
        : m.rawResponse?.reasoning_details != null
          ? { reasoning_details: m.rawResponse.reasoning_details }
          : m.rawResponse?.reasoning != null
            ? { reasoning: m.rawResponse.reasoning }
            : m.rawResponse?.reasoning_content != null
              ? { reasoning_content: m.rawResponse.reasoning_content }
              : {};

      return {
        role,
        content,
        // Pass through tool_calls if they were part of this assistant message
        ...(role === 'assistant' && m.rawResponse?.tool_calls ? { tool_calls: m.rawResponse.tool_calls } : {}),
        ...reasoningContext,
      } as any;
    });
  
  // Apply history limit if configured
  let slicedAgentMessages = agentConfig.maxHistory ? agentMessages.slice(-agentConfig.maxHistory) : agentMessages;
  if (agentConfig.maxHistory && slicedAgentMessages[0]?.role === 'tool') {
    let startIndex = agentMessages.length - slicedAgentMessages.length - 1;
    while (startIndex >= 0 && agentMessages[startIndex]?.role === 'tool') startIndex--;
    const possibleToolCaller = agentMessages[startIndex] as any;
    if (possibleToolCaller?.role === 'assistant' && possibleToolCaller.tool_calls) {
      slicedAgentMessages = agentMessages.slice(startIndex);
    } else {
      slicedAgentMessages = slicedAgentMessages.filter(message => message.role !== 'tool');
    }
  }

  const messagesForApi: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: fullPrompt },
      ...slicedAgentMessages,
      {
        role: 'user',
        content: `[ARENA TURN CONTROL — Agent ${currentAgentId} only]\n${prompt}`,
      },
    ];

  try {
    const { rawRequest, rawResponse } = await runDebateTurn({
      history: messagesForApi,
      agentConfig,
    }, onDelta);
    
    const parsed = parseResponse(rawResponse, agentConfig);

    return { 
        ...parsed, 
        rawRequest,
        rawResponse 
    };

  } catch (error) {
    // Let the engine show the actionable provider error and decide whether a
    // retry is appropriate. Rendering it as a debate message would hide it.
    throw error;
  }
}
