
'use client';
import { useReducer, useCallback, useEffect, useRef } from 'react';
import {
  LM0State,
  LM0Action,
  LM0Config,
  VirtualFileId,
  VirtualFile,
  HubMessage,
  HistoryEntry,
} from './types';
import { runMasterAgentTurn, runLLMTool } from './flows/master-agent-flow';
import { constructTurnPrompt, constructSystemPrompt } from './utils';
import type OpenAI from 'openai';


const initialState: LM0State = {
  config: null,
  status: 'configuring',
  error: undefined,
  virtualFiles: {},
  challenges: [],
  history: [],
  log: [],
  hubMessages: [],
  turnNumber: 0,
  sessionStartTime: null,
  lastHelperAgentUseTime: null,
  lastManualReadTime: null,
  messagesToMe: ["First turn: Read the manual.md file to understand your instructions, then generate the challenges in question-bank.md and create a plan in todo.md."],
  errors: [],
  errorCount: 0,
};

function lm0Reducer(state: LM0State, action: LM0Action): LM0State {
  switch (action.type) {
    case 'START_SESSION': {
      const { config } = action.payload;
      const challenges = Array.from({ length: config.challengeCount }, (_, i) => ({
        challengeNumber: i + 1,
        question: '',
        submittedAnswer: null,
        isCompleted: false,
        finalAnswer: null,
      }));

      const startingFiles: Record<VirtualFileId, VirtualFile> = {};
      config.allowedFiles.forEach(fileId => {
        startingFiles[fileId] = { id: fileId, content: `# ${fileId}\n\n` };
      });
      
      if (config.allowedFiles.includes('manual.md') && config.manualContent) {
          startingFiles['manual.md'].content = config.manualContent;
      }

      if (config.questionSource === 'user' && config.questionBankContent) {
        if (!startingFiles['question-bank.md']) {
           startingFiles['question-bank.md'] = { id: 'question-bank.md', content: '' };
        }
        startingFiles['question-bank.md']!.content = config.questionBankContent;
      }
      
      return {
        ...initialState,
        config,
        status: 'running',
        challenges: config.questionSource === 'agent' ? challenges : [],
        log: [`Turn 1: Agent is thinking...`],
        turnNumber: 1,
        sessionStartTime: Date.now(),
        virtualFiles: startingFiles,
      };
    }
    case 'PAUSE_SESSION':
      return { ...state, status: 'paused' };
    case 'RESUME_SESSION':
        return { ...state, status: 'running' };
    case 'FINISH_SESSION':
        return { ...state, status: 'finished' };
    case 'SET_ERROR':
      return { ...state, status: 'error', error: action.payload.error };
    case 'ADD_ERROR': {
      const newErrorCount = state.errorCount + 1;
      if (newErrorCount >= 5) {
        return {
          ...state,
          errors: [...state.errors, action.payload.error],
          errorCount: newErrorCount,
          status: 'error',
          error: `Session stopped after ${newErrorCount} consecutive errors. Last: ${action.payload.error}`,
        };
      }
      return {
        ...state,
        errors: [...state.errors, action.payload.error],
        errorCount: newErrorCount,
      };
    }
    case 'RESET':
      return initialState;
    case 'ADD_LOG':
      return { ...state, log: [...state.log, action.payload.message] };
    case 'ADD_HUB_MESSAGE':
        return { ...state, hubMessages: [...state.hubMessages, action.payload.message] };
    case 'ADD_HISTORY': {
      const { entry } = action.payload;
      const updatedHistory = [...state.history];
      const existingEntryIndex = updatedHistory.findIndex(h => h.turnNumber === entry.turnNumber);
      
      if (existingEntryIndex > -1) {
        const existingEntry = updatedHistory[existingEntryIndex]!;
        updatedHistory[existingEntryIndex] = {
          ...existingEntry,
          messages: [...existingEntry.messages, ...entry.messages],
        };
        return { ...state, history: updatedHistory };
      } else {
        return { ...state, history: [...updatedHistory, entry] };
      }
    }
    case 'ADD_MESSAGE_TO_ME':
        return { ...state, messagesToMe: [...state.messagesToMe, action.payload.message] };
    case 'ROLLBACK_TO_TURN': {
      const { turnNumber } = action.payload;
      if (turnNumber < 1 || turnNumber > state.messagesToMe.length) {
          return { ...state, log: [...state.log, `Error: Invalid turn number for rollback.`]};
      }
      const newMessagesToMe = state.messagesToMe.slice(0, turnNumber);
      return {
        ...state,
        messagesToMe: newMessagesToMe,
        turnNumber: turnNumber,
        log: [...state.log, `Agent rolled back to the state after turn ${turnNumber - 1}. Resuming from turn ${turnNumber}.`]
      };
    }
    case 'UPDATE_VIRTUAL_FILE': {
      const { fileId, content } = action.payload;
      if (!state.virtualFiles[fileId]) return state; // Don't update if file not allowed
      return {
        ...state,
        virtualFiles: {
          ...state.virtualFiles,
          [fileId]: { ...state.virtualFiles[fileId]!, content },
        },
      };
    }
    case 'SET_CHALLENGE_QUESTION': {
       const { challengeNumber, question } = action.payload;
       return {
           ...state,
           challenges: state.challenges.map(c => c.challengeNumber === challengeNumber ? {...c, question } : c)
       }
    }
    case 'UPLOAD_QUESTION': {
        const { challengeNumber, content } = action.payload;
        
        const updatedChallenges = state.challenges.map(c => 
            c.challengeNumber === challengeNumber ? { ...c, question: content } : c
        );

        const questionBankFile = state.virtualFiles['question-bank.md'];
        const updatedQuestionBankContent = questionBankFile 
            ? `${questionBankFile.content.trim()}\n- Challenge ${challengeNumber}: ${content}`
            : `# question-bank.md\n\n- Challenge ${challengeNumber}: ${content}`;
        
        return {
            ...state,
            challenges: updatedChallenges,
            virtualFiles: {
                ...state.virtualFiles,
                'question-bank.md': { ...state.virtualFiles['question-bank.md']!, content: updatedQuestionBankContent }
            },
        };
    }
    case 'UPLOAD_ANSWER': {
        const { challengeNumber, fileId } = action.payload;
        const answerContent = state.virtualFiles[fileId]?.content ?? `Error: Could not read content from '${fileId}'.`;
        return {
            ...state,
            challenges: state.challenges.map(c => 
                c.challengeNumber === challengeNumber ? { ...c, submittedAnswer: answerContent } : c
            ),
        };
    }
    case 'MARK_CHALLENGE_DONE': {
      const { challengeNumber } = action.payload;
      // When a challenge is done, we find the answer in the filesystem.
      const finalAnswerFromFile = state.virtualFiles['final-answer.md']?.content || 'Answer not found in file.';

      const updatedChallenges = state.challenges.map(c =>
        c.challengeNumber === challengeNumber ? { ...c, isCompleted: true, finalAnswer: finalAnswerFromFile } : c
      );
      const allDone = updatedChallenges.every(c => c.isCompleted);

      // Only finish if it was agent-generated questions and all are done.
      const shouldFinish = state.config?.questionSource === 'agent' && allDone;

      return {
        ...state,
        challenges: updatedChallenges,
        status: shouldFinish ? 'finished' : state.status,
      };
    }
    case 'START_NEXT_TURN': {
       const nextTurnNumber = state.turnNumber + 1;
        return { 
            ...state, 
            turnNumber: nextTurnNumber,
            log: [...state.log, `Turn ${nextTurnNumber}: Agent is thinking...`]
        };
    }
    case 'UPDATE_TIMER':
        return { ...state, [action.payload.timer]: Date.now() };
    default:
      return state;
  }
}

async function runAgentTurn(currentState: LM0State, dispatch: React.Dispatch<LM0Action>) {
    if (currentState.status !== 'running' || !currentState.config) return;

    let toolRolledBack = false;
    let sessionFinished = false;
    let messageToMeSuccessfullyCalledInTurn = false;
    
    // Initial prompt setup for the turn
    const systemPrompt = constructSystemPrompt(currentState.config);
    const turnPrompt = constructTurnPrompt(currentState);
    const turnHistoryMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: turnPrompt }
    ];

    try {
        // Create the history entry for the current turn with only the initial prompts
        dispatch({
          type: 'ADD_HISTORY',
          payload: { entry: { turnNumber: currentState.turnNumber, messages: turnHistoryMessages } }
        });

        for (let i = 0; i < 5; i++) {
            const agentResponse = await runMasterAgentTurn(turnHistoryMessages, currentState.config);
            
            // Immediately dispatch the raw response for this loop
            dispatch({
              type: 'ADD_HISTORY',
              payload: { entry: { turnNumber: currentState.turnNumber, messages: [agentResponse] } }
            });

            turnHistoryMessages.push(agentResponse);

            const hasToolCalls = agentResponse.tool_calls && agentResponse.tool_calls.length > 0;

            if (!hasToolCalls) {
                dispatch({ type: 'ADD_ERROR', payload: { error: "Agent returned no tool calls, but tool calls are required." } });
                break;
            }

            let toolCallResponses: OpenAI.Chat.ChatCompletionMessageParam[] = [];
            for (const toolCall of agentResponse.tool_calls!) {
                if (toolCall.type !== 'function') {
                    continue;
                }
                const { name, arguments: args } = toolCall.function;
                const { id } = toolCall;
                
                const argsString = typeof args === 'string' ? args.substring(0, 100) + (args.length > 100 ? '...' : '') : JSON.stringify(args).substring(0, 100);
                
                let toolResultContent: string;
                
                try {
                    const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;

                    if (name === 'message_to_me') {
                        dispatch({ type: 'ADD_MESSAGE_TO_ME', payload: { message: parsedArgs.message } });
                        dispatch({ type: 'ADD_LOG', payload: { message: `Agent Thought: ${parsedArgs.message}` } });
                        toolResultContent = "OK. Thought recorded.";
                        messageToMeSuccessfullyCalledInTurn = true;
                    } else {
                        dispatch({ type: 'ADD_LOG', payload: { message: `Executing tool: ${name}(${argsString})` } });

                        switch (name) {
                            case 'read_file':
                                const fileToRead = currentState.virtualFiles[parsedArgs.fileId as VirtualFileId];
                                toolResultContent = fileToRead ? fileToRead.content : `Error: File '${parsedArgs.fileId}' is not allowed or does not exist.`;
                                if (parsedArgs.fileId === 'manual.md') {
                                    dispatch({ type: 'UPDATE_TIMER', payload: { timer: 'lastManualReadTime' } });
                                }
                                break;
                            case 'write_file':
                                if (currentState.virtualFiles[parsedArgs.fileId as VirtualFileId]) {
                                    dispatch({ type: 'UPDATE_VIRTUAL_FILE', payload: { fileId: parsedArgs.fileId, content: parsedArgs.content } });
                                    toolResultContent = `File '${parsedArgs.fileId}' updated successfully.`;
                                } else {
                                    toolResultContent = `Error: File '${parsedArgs.fileId}' is not allowed in this session.`;
                                }
                                break;
                             case 'upload_question':
                                dispatch({ type: 'UPLOAD_QUESTION', payload: { challengeNumber: parsedArgs.challenge_number, content: parsedArgs.content } });
                                toolResultContent = `Question for challenge ${parsedArgs.challenge_number} uploaded to question-bank.md.`;
                                break;
                            case 'upload_answer':
                                dispatch({ type: 'UPLOAD_ANSWER', payload: { challengeNumber: parsedArgs.challenge_number, fileId: parsedArgs.fileId } });
                                toolResultContent = `Answer for challenge ${parsedArgs.challenge_number} uploaded from file '${parsedArgs.fileId}'.`;
                                break;
                            case 'call_llm_tool':
                                const llmConnection = currentState.config.llmConnections.find(c => c.id === parsedArgs.llm_connection_id);
                                if (llmConnection) {
                                    const { response: llmResponse } = await runLLMTool({
                                        config: llmConnection, 
                                        prompt: parsedArgs.prompt,
                                    });
                                    toolResultContent = llmResponse;
                                    const hubMessage: HubMessage = { id: `hub-${Date.now()}`, agentId: llmConnection.id, agentNickname: llmConnection.nickname, content: toolResultContent, timestamp: new Date().toISOString() };
                                    dispatch({ type: 'ADD_HUB_MESSAGE', payload: { message: hubMessage }});
                                    dispatch({ type: 'UPDATE_TIMER', payload: { timer: 'lastHelperAgentUseTime' } });
                                } else {
                                    toolResultContent = `Error: LLM connection with ID '${parsedArgs.llm_connection_id}' not found.`;
                                }
                                break;
                            case 'finish_challenge':
                                dispatch({ type: 'MARK_CHALLENGE_DONE', payload: { challengeNumber: parsedArgs.challenge_number } });
                                toolResultContent = `Challenge ${parsedArgs.challenge_number} marked as complete.`;
                                break;
                            case 'FINISH_SESSION':
                                dispatch({ type: 'FINISH_SESSION' });
                                toolResultContent = "Session finished by agent.";
                                sessionFinished = true;
                                break;
                            case 'ROLLBACK_STEP':
                                dispatch({ type: 'ROLLBACK_TO_TURN', payload: { turnNumber: parsedArgs.turn_number } });
                                toolResultContent = `History rolled back to turn ${parsedArgs.turn_number}.`;
                                toolRolledBack = true;
                                break;
                            default:
                                toolResultContent = `Error: Unknown tool '${name}'.`;
                        }
                    }
                } catch (e: any) {
                    toolResultContent = `Error executing tool ${name}: ${e.message}`;
                }

                dispatch({ type: 'ADD_LOG', payload: { message: `Tool Result: ${toolResultContent.substring(0, 200)}...` } });
                const toolResponseMessage = { role: 'tool' as const, tool_call_id: id, content: toolResultContent };
                toolCallResponses.push(toolResponseMessage);

                if (toolRolledBack || sessionFinished) break;
            }

            // Dispatch all tool responses for this loop at once
            dispatch({
              type: 'ADD_HISTORY',
              payload: { entry: { turnNumber: currentState.turnNumber, messages: toolCallResponses } }
            });

            turnHistoryMessages.push(...toolCallResponses);

            if (toolRolledBack || sessionFinished || messageToMeSuccessfullyCalledInTurn) break;
        }

        if (!messageToMeSuccessfullyCalledInTurn && !toolRolledBack && !sessionFinished) {
            throw new Error("Agent failed to call the required 'message_to_me' tool successfully after multiple attempts. The session cannot continue.");
        }

    } catch (error: any) {
      console.error("Error during agent turn:", error);
      dispatch({ type: 'ADD_ERROR', payload: { error: error.message || 'An unknown error occurred during the agent turn.' } });
    } finally {
        if (currentState.status === 'running' && !toolRolledBack && !sessionFinished) {
            dispatch({ type: 'START_NEXT_TURN' });
        }
    }
}


export function useLM0Engine() {
  const [state, dispatch] = useReducer(lm0Reducer, initialState);
  const stateRef = useRef(state);
  const isRunningTurn = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const runTurnCallback = useCallback(async () => {
    if (isRunningTurn.current) return;
    isRunningTurn.current = true;
    
    try {
        await runAgentTurn(stateRef.current, dispatch);
    } catch (error: any) {
        console.error("Critical failure in agent turn. Halting session.", error);
        dispatch({ type: 'SET_ERROR', payload: { error: error.message || 'A critical agent failure occurred, halting the session.' } });
    } finally {
        isRunningTurn.current = false;
    }
  }, [dispatch]);

  useEffect(() => {
    if (state.status === 'running') {
        const timer = setTimeout(() => {
            runTurnCallback();
        }, 1000);
        return () => clearTimeout(timer);
    }
  }, [state.status, state.turnNumber, runTurnCallback]);
  
  return { state, dispatch };
}
