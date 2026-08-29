
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
  LM0Checkpoint,
} from './types';
import { runMasterAgentTurn, runLLMTool } from './flows/master-agent-flow';
import { constructTurnPrompt, constructSystemPrompt, normalizeLM0Config } from './utils';
import { StreamCompletionError } from '@/lib/chat-stream';
import type OpenAI from 'openai';

const MAX_CONSECUTIVE_RECOVERABLE_ERRORS = 50;
const MAX_TOOL_CALL_ATTEMPTS_PER_TURN = 5;

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
  queuedResearcherInstruction: null,
  turnCheckpoints: {},
  runRevision: 0,
  errors: [],
  errorCount: 0,
};

const cloneHistoryMessages = (messages: OpenAI.Chat.ChatCompletionMessageParam[]) =>
  JSON.parse(JSON.stringify(messages)) as OpenAI.Chat.ChatCompletionMessageParam[];

const cloneCheckpoint = (checkpoint: LM0Checkpoint): LM0Checkpoint => ({
  ...checkpoint,
  virtualFiles: Object.fromEntries(
    Object.entries(checkpoint.virtualFiles).map(([id, file]) => [id, { ...file }]),
  ),
  challenges: checkpoint.challenges.map(challenge => ({ ...challenge })),
  hubMessages: checkpoint.hubMessages.map(message => ({ ...message })),
  history: checkpoint.history.map(entry => ({
    ...entry,
    messages: cloneHistoryMessages(entry.messages),
  })),
  log: [...checkpoint.log],
  errors: [...checkpoint.errors],
  messagesToMe: [...checkpoint.messagesToMe],
});

/** Capture all mutable LAB runtime data without recursively copying checkpoints. */
export function createLM0Checkpoint(state: LM0State): LM0Checkpoint {
  return cloneCheckpoint({
    turnNumber: state.turnNumber,
    virtualFiles: state.virtualFiles,
    challenges: state.challenges,
    hubMessages: state.hubMessages,
    history: state.history,
    log: state.log,
    errors: state.errors,
    errorCount: state.errorCount,
    error: state.error,
    sessionStartTime: state.sessionStartTime,
    lastHelperAgentUseTime: state.lastHelperAgentUseTime,
    lastManualReadTime: state.lastManualReadTime,
    messagesToMe: state.messagesToMe,
    queuedResearcherInstruction: state.queuedResearcherInstruction,
  });
}

function restoreLM0Checkpoint(
  state: LM0State,
  checkpointInput: LM0Checkpoint,
  status: 'running' | 'paused',
): LM0State {
  const checkpoint = cloneCheckpoint(checkpointInput);
  const retainedCheckpoints = Object.fromEntries(
    Object.entries(state.turnCheckpoints)
      .filter(([turn]) => Number(turn) <= checkpoint.turnNumber)
      .map(([turn, saved]) => [turn, cloneCheckpoint(saved)]),
  );

  retainedCheckpoints[checkpoint.turnNumber] = cloneCheckpoint(checkpoint);

  return {
    ...state,
    ...checkpoint,
    status,
    turnCheckpoints: retainedCheckpoints,
  };
}

function initialDirection(config: LM0Config): string {
  const steps = config.allowedFiles.includes('manual.md')
    ? ['Read manual.md to understand your instructions']
    : [];

  if (config.questionSource === 'user') {
    steps.push('read the supplied challenges in question-bank.md');
  } else {
    steps.push('generate the challenges in question-bank.md');
  }
  if (config.allowedFiles.includes('todo.md')) {
    steps.push('create a plan in todo.md');
  } else {
    steps.push('create a plan for solving them');
  }

  return `First turn: ${steps.join(', then ')}.`;
}

function lm0Reducer(state: LM0State, action: LM0Action): LM0State {
  switch (action.type) {
    case 'START_SESSION': {
      const config = normalizeLM0Config(action.payload.config);
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

      if (config.questionSource === 'user') {
        startingFiles['question-bank.md'] = {
          id: 'question-bank.md',
          content: config.questionBankContent || '# question-bank.md\n\n',
        };
      }

      const startedState: LM0State = {
        ...initialState,
        config,
        status: 'running',
        challenges: config.questionSource === 'agent' ? challenges : [],
        log: [`Turn 1: Agent is thinking...`],
        turnNumber: 1,
        sessionStartTime: Date.now(),
        virtualFiles: startingFiles,
        messagesToMe: [initialDirection(config)],
        queuedResearcherInstruction: null,
        turnCheckpoints: {},
      };
      startedState.turnCheckpoints = { 1: createLM0Checkpoint(startedState) };
      return startedState;
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
      if (newErrorCount >= MAX_CONSECUTIVE_RECOVERABLE_ERRORS) {
        return {
          ...state,
          errors: [...state.errors, action.payload.error],
          errorCount: newErrorCount,
          status: 'error',
          error: `Session stopped after ${newErrorCount} consecutive recoverable errors. Last: ${action.payload.error}`,
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
      const entryMessages = cloneHistoryMessages(entry.messages);
      const updatedHistory = [...state.history];
      const existingEntryIndex = updatedHistory.findIndex(h => h.turnNumber === entry.turnNumber);
      
      if (existingEntryIndex > -1) {
        const existingEntry = updatedHistory[existingEntryIndex]!;
        updatedHistory[existingEntryIndex] = {
          ...existingEntry,
          messages: [...existingEntry.messages, ...entryMessages],
        };
        return { ...state, history: updatedHistory };
      } else {
        return { ...state, history: [...updatedHistory, { ...entry, messages: entryMessages }] };
      }
    }
    case 'ADD_MESSAGE_TO_ME':
        return { ...state, messagesToMe: [...state.messagesToMe, action.payload.message] };
    case 'CLEAR_CONSECUTIVE_ERRORS':
        return state.errorCount === 0 && !state.error
          ? state
          : { ...state, errorCount: 0, error: undefined };
    case 'ROLLBACK_TO_TURN': {
      const { turnNumber } = action.payload;
      const checkpoint = state.turnCheckpoints[turnNumber];
      if (!checkpoint) {
          return { ...state, log: [...state.log, `Error: Invalid turn number for rollback.`]};
      }
      const restored = restoreLM0Checkpoint(state, checkpoint, 'running');
      return {
        ...restored,
        runRevision: state.runRevision + 1,
        log: [...restored.log, `Agent rolled back to the state after turn ${turnNumber - 1}. Resuming from turn ${turnNumber}.`],
      };
    }
    case 'RESTORE_CHECKPOINT': {
      const restored = restoreLM0Checkpoint(state, action.payload.checkpoint, action.payload.status || 'paused');
      return { ...restored, runRevision: state.runRevision + 1 };
    }
    case 'QUEUE_RESEARCHER_INSTRUCTION': {
      const instruction = action.payload.instruction.trim();
      if (!instruction || state.status !== 'paused') return state;
      return {
        ...state,
        queuedResearcherInstruction: instruction,
        log: [...state.log, 'Researcher instruction queued for the next successful turn.'],
      };
    }
    case 'CONSUME_RESEARCHER_INSTRUCTION':
      return { ...state, queuedResearcherInstruction: null };
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
       if (state.status !== 'running') return state;
       const nextTurnNumber = state.turnNumber + 1;
       const nextTurnState: LM0State = {
            ...state, 
            turnNumber: nextTurnNumber,
            log: [...state.log, `Turn ${nextTurnNumber}: Agent is thinking...`]
       };
       return {
         ...nextTurnState,
         turnCheckpoints: {
           ...state.turnCheckpoints,
           [nextTurnNumber]: createLM0Checkpoint(nextTurnState),
         },
       };
    }
    case 'UPDATE_TIMER':
        return { ...state, [action.payload.timer]: Date.now() };
    default:
      return state;
  }
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted
    || (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError');
}

function isRecoverableTurnError(error: unknown): boolean {
  if (error instanceof StreamCompletionError) return error.retryable;
  if (error instanceof Error && /no api key|model, provider url, and api key are required/i.test(error.message)) {
    return false;
  }
  return true;
}

async function runAgentTurn(
  currentState: LM0State,
  dispatch: React.Dispatch<LM0Action>,
  signal: AbortSignal,
) {
    if (currentState.status !== 'running' || !currentState.config) return;

    let toolRolledBack = false;
    let sessionFinished = false;
    let messageToMeSuccessfullyCalledInTurn = false;
    let turnSucceeded = false;
    const workingFiles = Object.fromEntries(
      Object.entries(currentState.virtualFiles).map(([id, file]) => [id, { ...file }]),
    );
    
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

        for (let i = 0; i < MAX_TOOL_CALL_ATTEMPTS_PER_TURN; i++) {
            signal.throwIfAborted();
            const agentResponse = await runMasterAgentTurn(turnHistoryMessages, currentState.config, signal);
            signal.throwIfAborted();
            
            // Immediately dispatch the raw response for this loop
            dispatch({
              type: 'ADD_HISTORY',
              payload: { entry: { turnNumber: currentState.turnNumber, messages: [agentResponse] } }
            });

            turnHistoryMessages.push(agentResponse);

            const hasToolCalls = agentResponse.tool_calls && agentResponse.tool_calls.length > 0;

            if (!hasToolCalls) {
                const reminder: OpenAI.Chat.ChatCompletionMessageParam = {
                  role: 'user',
                  content: "Your previous response did not call a tool. Retry with a tool_calls array and include the required 'message_to_me' call.",
                };
                dispatch({
                  type: 'ADD_HISTORY',
                  payload: { entry: { turnNumber: currentState.turnNumber, messages: [reminder] } },
                });
                turnHistoryMessages.push(reminder);
                continue;
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
                                const fileToRead = workingFiles[parsedArgs.fileId as VirtualFileId];
                                toolResultContent = fileToRead ? fileToRead.content : `Error: File '${parsedArgs.fileId}' is not allowed or does not exist.`;
                                if (parsedArgs.fileId === 'manual.md') {
                                    dispatch({ type: 'UPDATE_TIMER', payload: { timer: 'lastManualReadTime' } });
                                }
                                break;
                            case 'write_file':
                                if (workingFiles[parsedArgs.fileId as VirtualFileId]) {
                                    dispatch({ type: 'UPDATE_VIRTUAL_FILE', payload: { fileId: parsedArgs.fileId, content: parsedArgs.content } });
                                    workingFiles[parsedArgs.fileId as VirtualFileId] = {
                                      ...workingFiles[parsedArgs.fileId as VirtualFileId]!,
                                      content: parsedArgs.content,
                                    };
                                    toolResultContent = `File '${parsedArgs.fileId}' updated successfully.`;
                                } else {
                                    toolResultContent = `Error: File '${parsedArgs.fileId}' is not allowed in this session.`;
                                }
                                break;
                             case 'upload_question':
                                dispatch({ type: 'UPLOAD_QUESTION', payload: { challengeNumber: parsedArgs.challenge_number, content: parsedArgs.content } });
                                workingFiles['question-bank.md'] = {
                                  id: 'question-bank.md',
                                  content: `${workingFiles['question-bank.md']?.content.trim() || '# question-bank.md'}\n- Challenge ${parsedArgs.challenge_number}: ${parsedArgs.content}`,
                                };
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
                                        signal,
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
                                if (currentState.turnCheckpoints[parsedArgs.turn_number]) {
                                  dispatch({ type: 'ROLLBACK_TO_TURN', payload: { turnNumber: parsedArgs.turn_number } });
                                  toolResultContent = `History rolled back to turn ${parsedArgs.turn_number}.`;
                                  toolRolledBack = true;
                                } else {
                                  toolResultContent = `Error: Turn ${parsedArgs.turn_number} has no checkpoint and cannot be restored.`;
                                }
                                break;
                            default:
                                toolResultContent = `Error: Unknown tool '${name}'.`;
                        }
                    }
                } catch (e: any) {
                    if (isAbortError(e, signal)) throw e;
                    toolResultContent = `Error executing tool ${name}: ${e.message}`;
                }

                // A rollback already restored the prior checkpoint. Do not append
                // the rollback tool's transient log/history to that restored state.
                if (toolRolledBack) break;

                dispatch({ type: 'ADD_LOG', payload: { message: `Tool Result: ${toolResultContent.substring(0, 200)}...` } });
                const toolResponseMessage = { role: 'tool' as const, tool_call_id: id, content: toolResultContent };
                toolCallResponses.push(toolResponseMessage);

                if (toolRolledBack || sessionFinished) break;
            }

            // Dispatch all tool responses for this loop at once
            if (!toolRolledBack && toolCallResponses.length > 0) {
              dispatch({
                type: 'ADD_HISTORY',
                payload: { entry: { turnNumber: currentState.turnNumber, messages: toolCallResponses } }
              });
            }

            turnHistoryMessages.push(...toolCallResponses);

            if (toolRolledBack || sessionFinished || messageToMeSuccessfullyCalledInTurn) break;
        }

        if (!messageToMeSuccessfullyCalledInTurn && !toolRolledBack && !sessionFinished) {
            throw new Error(`Agent failed to call the required 'message_to_me' tool successfully after ${MAX_TOOL_CALL_ATTEMPTS_PER_TURN} attempts.`);
        }

        turnSucceeded = messageToMeSuccessfullyCalledInTurn || sessionFinished;

    } catch (error: any) {
      if (isAbortError(error, signal)) return;
      console.error("Error during agent turn:", error);
      const message = error.message || 'An unknown error occurred during the agent turn.';
      dispatch(isRecoverableTurnError(error)
        ? { type: 'ADD_ERROR', payload: { error: message } }
        : { type: 'SET_ERROR', payload: { error: message } });
    } finally {
        if (!signal.aborted && !toolRolledBack && !sessionFinished) {
            if (turnSucceeded) {
              if (currentState.queuedResearcherInstruction) {
                dispatch({ type: 'CONSUME_RESEARCHER_INSTRUCTION' });
              }
              dispatch({ type: 'CLEAR_CONSECUTIVE_ERRORS' });
            }
            dispatch({ type: 'START_NEXT_TURN' });
        }
    }
}


export function useLM0Engine() {
  const [state, dispatch] = useReducer(lm0Reducer, initialState);
  const stateRef = useRef(state);
  const isRunningTurn = useRef(false);
  const activeTurnAbortController = useRef<AbortController | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const runTurnCallback = useCallback(async () => {
    if (isRunningTurn.current) {
      setTimeout(() => {
        if (stateRef.current.status === 'running') void runTurnCallback();
      }, 250);
      return;
    }
    isRunningTurn.current = true;
    const abortController = new AbortController();
    activeTurnAbortController.current = abortController;
    
    try {
        await runAgentTurn(stateRef.current, dispatch, abortController.signal);
    } catch (error: any) {
        if (isAbortError(error, abortController.signal)) return;
        console.error("Critical failure in agent turn. Halting session.", error);
        dispatch({ type: 'SET_ERROR', payload: { error: error.message || 'A critical agent failure occurred, halting the session.' } });
    } finally {
        if (activeTurnAbortController.current === abortController) {
          activeTurnAbortController.current = null;
        }
        isRunningTurn.current = false;
    }
  }, []);

  const abortCurrentTurn = useCallback((reason = 'LAB session interrupted by the researcher.') => {
    activeTurnAbortController.current?.abort(reason);
  }, []);

  const pauseSession = useCallback(() => {
    abortCurrentTurn('LAB session paused by the researcher.');
    dispatch({ type: 'PAUSE_SESSION' });
  }, [abortCurrentTurn]);

  const resumeSession = useCallback(() => dispatch({ type: 'RESUME_SESSION' }), []);

  const finishSession = useCallback(() => {
    abortCurrentTurn('LAB session stopped by the researcher.');
    dispatch({ type: 'FINISH_SESSION' });
  }, [abortCurrentTurn]);

  const resetSession = useCallback(() => {
    abortCurrentTurn('LAB session reset by the researcher.');
    dispatch({ type: 'RESET' });
  }, [abortCurrentTurn]);

  const captureCheckpoint = useCallback(() => createLM0Checkpoint(stateRef.current), []);

  const restoreCheckpoint = useCallback((
    checkpoint: LM0Checkpoint,
    status: 'running' | 'paused' = 'paused',
  ) => {
    abortCurrentTurn('LAB checkpoint restored by the researcher.');
    dispatch({ type: 'RESTORE_CHECKPOINT', payload: { checkpoint, status } });
  }, [abortCurrentTurn]);

  const queueResearcherInstruction = useCallback((instruction: string) => {
    dispatch({ type: 'QUEUE_RESEARCHER_INSTRUCTION', payload: { instruction } });
  }, []);

  useEffect(() => {
    if (state.status !== 'running') {
      abortCurrentTurn(`LAB session is ${state.status}.`);
    }
  }, [state.status, abortCurrentTurn]);

  useEffect(() => {
    if (state.status === 'running') {
        const timer = setTimeout(() => {
            runTurnCallback();
        }, 1000);
        return () => clearTimeout(timer);
    }
  }, [state.status, state.turnNumber, state.runRevision, runTurnCallback]);
  
  return {
    state,
    dispatch,
    abortCurrentTurn,
    pauseSession,
    resumeSession,
    finishSession,
    resetSession,
    captureCheckpoint,
    restoreCheckpoint,
    queueResearcherInstruction,
  };
}
