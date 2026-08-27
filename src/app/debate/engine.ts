'use client';
import { useReducer, useEffect, useRef, useCallback } from 'react';
import {
  DebateState,
  DebateAction,
  Message,
  DebateConfig,
  AgentID,
} from './types';
import { fetchAgentResponse } from './agent';


const initialDebateState: DebateState = {
  messages: [],
  currentTurn: 'A',
  isDebating: false,
  winner: null,
  errorCount: 0,
  config: null,
};

function debateReducer(state: DebateState, action: DebateAction): DebateState {
  switch (action.type) {
    case 'START_DEBATE':
      return {
        ...state,
        isDebating: true,
        config: action.payload.config,
        messages: [
          {
            id: Date.now(),
            author: 'SYSTEM',
            role: 'system',
            content: action.payload.config.topic ? `Arena session started on the topic: "${action.payload.config.topic}"` : `Arena session started.`,
            intendedFor: 'ALL',
          },
        ],
        currentTurn: action.payload.config.agentSpeaksFirst,
        winner: null,
      };
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'UPDATE_MESSAGE':
        return {
            ...state,
            messages: state.messages.map(msg =>
                msg.id === action.payload.id ? { ...msg, ...action.payload } : msg
            ),
        };
    case 'APPEND_TO_MESSAGE': {
        const { id, contentChunk } = action.payload;
        return {
            ...state,
            messages: state.messages.map(msg =>
                msg.id === id ? { ...msg, content: msg.content + contentChunk, isLoading: false } : msg
            ),
        };
    }
    case 'END_DEBATE':
      return { ...state, isDebating: false, winner: action.payload.winner };
    case 'GIVE_UP': {
      const { winner, reason, givingUpAgent } = action.payload;
      const systemMessageContent = givingUpAgent === 'SYSTEM' ? reason : `Agent ${givingUpAgent} has finished the session. Result: "${reason}"`;
      const systemMessage: Message = {
        id: Date.now() + 1,
        author: 'SYSTEM',
        role: 'system',
        content: systemMessageContent,
        intendedFor: 'ALL',
      };
      return {
        ...state,
        messages: [...state.messages, systemMessage],
        isDebating: false,
        winner,
      };
    }
    case 'SWITCH_TURN':
      return { ...state, currentTurn: state.currentTurn === 'A' ? 'B' : 'A' };
    case 'RESET':
      return {
        ...initialDebateState,
        messages: [],
        currentTurn: action.payload.agentSpeaksFirst,
        errorCount: 0,
      };
    case 'ADD_ERROR': {
        const newErrorCount = state.errorCount + 1;
        if (newErrorCount >= 50) {
            return {
                ...state,
                errorCount: newErrorCount,
                isDebating: false,
                winner: 'draw',
                messages: [
                    ...state.messages,
                    {
                        id: Date.now() + 2,
                        author: 'SYSTEM',
                        role: 'system',
                        content: `Arena stopped after ${newErrorCount} errors.`,
                        intendedFor: 'ALL',
                    }
                ]
            };
        }
        return { ...state, errorCount: newErrorCount };
    }
    default:
      return state;
  }
}

export function useDebateEngine(initialConfig: DebateConfig) {
  const [state, dispatch] = useReducer(debateReducer, initialDebateState);
  const stateRef = useRef(state);
  const isRunningTurn = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const runTurn = useCallback(async () => {
    const currentState = stateRef.current;
    if (!currentState.isDebating || currentState.winner || isRunningTurn.current || !currentState.config) return;

    isRunningTurn.current = true;

    const MAX_RETRIES = 3;
    let currentThinkingMessageId: number | null = null;
    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const currentAgentId = stateRef.current.currentTurn;
        const opponentAgentId = currentAgentId === 'A' ? 'B' : 'A';
        const currentAgentConfig = currentAgentId === 'A' ? stateRef.current.config!.agentA : stateRef.current.config!.agentB;

        let loopCount = 0;
        let turnFinished = false;

        while (!turnFinished && loopCount < 10) {
          loopCount++;
          
          const lastMessage = stateRef.current.messages.slice().reverse().find(m => (m.author === 'A' || m.author === 'B') && !m.isLoading);
          const isFirstTurn = !lastMessage;
          const prompt = isFirstTurn ? "You are the first speaker. Begin." : "It is now your turn. Use tools if needed, then speak to your opponent.";

          const thinkingMessage: Message = {
            id: Date.now(),
            author: currentAgentId,
            role: 'assistant',
            content: '',
            isThinking: currentAgentConfig.canThink, // Persistent capability flag from state config
            isLoading: true, // Transient loading state
            intendedFor: 'ALL',
          };
          currentThinkingMessageId = thinkingMessage.id;
          dispatch({ type: 'ADD_MESSAGE', payload: thinkingMessage });

          const response = await fetchAgentResponse(currentAgentConfig, stateRef.current.messages, prompt, currentAgentId, stateRef.current.config!);
        const { speak: visibleMessage, thinking: privateReasoning, rawRequest, rawResponse } = response;

        // Update the message with results and clear loading state, but preserve isThinking
        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: {
            id: thinkingMessage.id,
            privateReasoning,
            rawRequest,
            rawResponse,
            isLoading: false
          }
        });

        // Handle Tool Calls
        if (rawResponse.tool_calls && rawResponse.tool_calls.length > 0) {
          let hasSpoken = false;
          
          for (const toolCall of rawResponse.tool_calls) {
            const toolName = toolCall.function.name;
            const toolId = toolCall.id;

            // Handle Give Up tool
            if (toolName === 'giveUp') {
              try {
                const args = JSON.parse(toolCall.function.arguments);
                dispatch({ type: 'GIVE_UP', payload: { winner: opponentAgentId, reason: args.reason, givingUpAgent: currentAgentId } });
                turnFinished = true;
              } catch (e) {
                dispatch({ type: 'END_DEBATE', payload: { winner: opponentAgentId } });
              }
              break;
            }

            // Check if this tool triggers a winner
            const customTool = currentAgentConfig.customTools.find(t => t.name === toolName);
            if (customTool?.triggerWinner && !customTool.sendToOpponent) {
                let finalWinner: AgentID | 'draw' | null = 'draw';
                if (customTool.triggerWinner === 'SELF') finalWinner = currentAgentId;
                else if (customTool.triggerWinner === 'OPPONENT') finalWinner = opponentAgentId;
                else if (customTool.triggerWinner === 'A' || customTool.triggerWinner === 'B') finalWinner = customTool.triggerWinner;

                dispatch({ 
                    type: 'GIVE_UP', 
                    payload: { 
                        winner: finalWinner, 
                        reason: `Session concluded: Agent ${currentAgentId} used the tool "${toolName}" which triggered a victory/conclusion.`, 
                        givingUpAgent: 'SYSTEM'
                    } 
                });
                turnFinished = true;
                break;
            }

            // Internal Tools Result Processing
            let toolResult = "";
            if (toolName === 'read_manual') {
              toolResult = currentAgentConfig.manualContent || "The manual is empty.";
            } else {
              toolResult = customTool ? customTool.systemResponse : `Error: Tool ${toolName} not found.`;
            }

            const toolResponseMessage: Message = {
              id: Date.now() + Math.random(),
              author: 'SYSTEM',
              role: 'tool',
              content: toolResult,
              tool_call_id: toolId,
              intendedFor: currentAgentId // Default to private result for caller
            };
            dispatch({ type: 'ADD_MESSAGE', payload: toolResponseMessage });

            // If 'Send to Opponent' is enabled, post a public update
            if (customTool?.sendToOpponent) {
                const args = toolCall.function.arguments;
                const publicMessage: Message = {
                    id: Date.now() + Math.random() + 1,
                    author: 'SYSTEM',
                    role: 'system',
                    content: `[System Update] ${currentAgentConfig.nickname || currentAgentId} used "${toolName}". Result: ${toolResult} (Details: ${args})`,
                    intendedFor: 'ALL'
                };
                dispatch({ type: 'ADD_MESSAGE', payload: publicMessage });
            }
          }

          if (turnFinished) break;

          // If the agent also provided text, stream it.
          if (visibleMessage.trim().length > 0) {
            const chunks = visibleMessage.split(' ');
            for (const chunk of chunks) {
              await new Promise(r => setTimeout(r, 30));
              dispatch({ type: 'APPEND_TO_MESSAGE', payload: { id: thinkingMessage.id, contentChunk: chunk + ' ' } });
            }
            hasSpoken = true;
          }

          if (hasSpoken) {
            turnFinished = true;
            dispatch({ type: 'SWITCH_TURN' });
          }
          // If no text was spoken, the loop continues (agent called a tool and now needs to think again)

        } else {
          // No tools, just a standard message. Stream it.
          const chunks = visibleMessage.split(' ');
          for (const chunk of chunks) {
            await new Promise(r => setTimeout(r, 50));
            dispatch({ type: 'APPEND_TO_MESSAGE', payload: { id: thinkingMessage.id, contentChunk: chunk + ' ' } });
          }
          turnFinished = true;
          dispatch({ type: 'SWITCH_TURN' });
        }
      }

    } catch (e: any) {
        lastError = e;
        // Remove the broken thinking message if one was added for this attempt
        if (currentThinkingMessageId) {
            dispatch({
                type: 'UPDATE_MESSAGE',
                payload: {
                    id: currentThinkingMessageId,
                    content: `[Attempt ${attempt}/${MAX_RETRIES} failed: ${e.message}. ${attempt < MAX_RETRIES ? 'Retrying...' : 'Giving up.'}]`,
                    isLoading: false
                }
            });
            currentThinkingMessageId = null;
        }
        
        if (attempt < MAX_RETRIES) {
            const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
            console.warn(`Debate turn attempt ${attempt} failed: ${e.message}. Retrying in ${delay / 1000}s...`);
            await new Promise(r => setTimeout(r, delay));
            continue; // retry
        }
      }

      // If we reach here without error, the turn succeeded — break out of retry loop
      lastError = null;
      break;
    }

    // All retries exhausted
    if (lastError) {
        dispatch({ type: 'ADD_ERROR', payload: { error: lastError.message } });
        dispatch({ type: 'END_DEBATE', payload: { winner: 'draw' } });
    }

    isRunningTurn.current = false;
  }, [dispatch]);
  
  useEffect(() => {
    if (state.isDebating && !state.winner) {
      const timer = setTimeout(() => {
        runTurn();
      }, 1000); 
      return () => clearTimeout(timer);
    }
  }, [state.isDebating, state.winner, state.currentTurn, runTurn]);

  return { state, dispatch };
}
