
'use client';
import { useReducer, useEffect, useRef, useCallback } from 'react';
import {
  ProvingGroundState,
  ProvingGroundAction,
  Evaluation,
  Turn,
} from './types';
import { runStudentTurn } from './flows/student-flow';
import { runTeacherTurn } from './flows/teacher-flow';
import { getStudentPrompt, getTeacherQuestionPrompt, getTeacherEvaluationPrompt, getTeacherSummaryPrompt, constructTeacherHistory, sanitizeMessage } from './utils';
import { parseWithThinking } from './parser';


const initialState: ProvingGroundState = {
  config: null,
  transcript: null,
  status: 'configuring',
  currentPhase: 'asking',
  activityMessage: 'Configure the examination to begin.',
  errorCount: 0,
};

function provingGroundReducer(state: ProvingGroundState, action: ProvingGroundAction): ProvingGroundState {
  switch (action.type) {
    case 'START_EXAM':
      return {
        ...initialState,
        status: 'running',
        currentPhase: 'asking',
        activityMessage: 'Starting examination. Contacting the teacher for question 1…',
        config: action.payload.config,
        transcript: {
          config: action.payload.config,
          startedAt: new Date().toISOString(),
          finishedAt: '',
          turns: [],
          finalSummary: '',
        },
      };
    case 'PROCESS_TEACHER_QUESTION': {
      if (!state.transcript) return state;
      const { question, rawRequest, rawResponse, thinking } = action.payload;

      const newTurn: Turn = {
        turnNumber: state.transcript.turns.length + 1,
        question: question,
        answer: '',
        evaluation: null,
        teacherThinking: thinking,
        studentThinking: null,
        rawQuestionRequest: rawRequest,
        rawQuestionResponse: sanitizeMessage(rawResponse),
        rawAnswerRequest: null,
        rawAnswerResponse: null,
        rawEvaluationRequest: null,
        rawEvaluationResponse: null,
      };

      return {
        ...state,
        transcript: { ...state.transcript, turns: [...state.transcript.turns, newTurn] },
        currentPhase: 'answering',
        activityMessage: 'Question received. Asking the student for an answer…',
        errorCount: 0,
      };
    }
    case 'PROCESS_STUDENT_ANSWER': {
      if (!state.transcript) return state;
      const { answer, rawRequest, rawResponse, thinking } = action.payload;

      const lastTurnIndex = state.transcript.turns.length - 1;
      const updatedTurns = [...state.transcript.turns];
      updatedTurns[lastTurnIndex].answer = answer;
      updatedTurns[lastTurnIndex].studentThinking = thinking;
      updatedTurns[lastTurnIndex].rawAnswerRequest = rawRequest;
      updatedTurns[lastTurnIndex].rawAnswerResponse = sanitizeMessage(rawResponse);

      return {
        ...state,
        transcript: { ...state.transcript, turns: updatedTurns },
        currentPhase: 'evaluating',
        activityMessage: 'Student answer received. Asking the teacher to evaluate it…',
        errorCount: 0,
      };
    }
    case 'PROCESS_TEACHER_EVALUATION': {
      if (!state.transcript || state.transcript.turns.length === 0) return state;
      const { evaluation, rawRequest, rawResponse, thinking } = action.payload;

      const lastTurnIndex = state.transcript.turns.length - 1;
      const updatedTurns = [...state.transcript.turns];
      updatedTurns[lastTurnIndex].evaluation = evaluation;
      updatedTurns[lastTurnIndex].rawEvaluationRequest = rawRequest;
      updatedTurns[lastTurnIndex].rawEvaluationResponse = sanitizeMessage(rawResponse);

      if (updatedTurns[lastTurnIndex].teacherThinking) {
        updatedTurns[lastTurnIndex].teacherThinking += `\n\n--- (Evaluation) ---\n\n${thinking}`;
      } else {
        updatedTurns[lastTurnIndex].teacherThinking = thinking;
      }
      
      const isFinalEvaluation = updatedTurns.length === state.config?.questionCount;

      return {
        ...state,
        transcript: { ...state.transcript, turns: updatedTurns },
        currentPhase: isFinalEvaluation ? 'summarizing' : 'asking',
        activityMessage: isFinalEvaluation
          ? 'All questions are graded. Preparing the final report…'
          : 'Evaluation recorded. Preparing the next question…',
        errorCount: 0,
      };
    }
    case 'SET_FINAL_SUMMARY': {
      if (!state.transcript) return state;
      const { summary, rawRequest, rawResponse } = action.payload;
      return {
        ...state,
        transcript: { 
          ...state.transcript, 
          finalSummary: summary,
          turns: state.transcript.turns.map(t => {
            // Find the last turn and attach the summary request/response to it
            if (t.turnNumber === state.transcript!.turns.length) {
              return { 
                ...t, 
                rawSummaryRequest: rawRequest, 
                rawSummaryResponse: sanitizeMessage(rawResponse) 
              };
            }
            return t;
          })
        },
      };
    }
    case 'FINISH_EXAM':
      if (!state.transcript) return state;
      return {
        ...state,
        status: 'finished',
        activityMessage: 'Examination complete. Your report is ready.',
        transcript: {
          ...state.transcript,
          finishedAt: new Date().toISOString(),
        },
      };
    case 'SET_ERROR':
      return {
        ...state,
        status: 'error',
        error: action.payload.error,
        activityMessage: `Examination stopped: ${action.payload.error}`,
      };
    case 'SET_ACTIVITY':
      return { ...state, activityMessage: action.payload.message };
    case 'ADD_ERROR': {
        const newErrorCount = state.errorCount + 1;
        if (newErrorCount >= 5) {
            return {
                ...state,
                errorCount: newErrorCount,
                status: 'error',
                error: `Examination stopped after ${newErrorCount} consecutive errors. Last: ${action.payload.error}`,
                activityMessage: `Examination stopped after repeated provider errors: ${action.payload.error}`,
            };
        }
        return {
            ...state,
            errorCount: newErrorCount,
        };
    }
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}


async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 5,
  delay = 3000,
  onRetry?: (message: string) => void,
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (error.status === 429) {
        throw lastError;
      }
      const errorMessage = error.message || 'An unknown API error occurred';
      const status = error.status ? ` (status: ${error.status})` : '';
      console.warn(`Attempt ${i + 1} failed: ${errorMessage}${status}. Retrying in ${delay / 1000}s...`);
      onRetry?.(`Provider request delayed${status}. Retrying ${i + 2}/${attempts} in ${delay / 1000} seconds…`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}


export function useProvingGroundEngine() {
  const [state, dispatch] = useReducer(provingGroundReducer, initialState);
  const isRunning = useRef(false);

  const runPhase = useCallback(async () => {
    if (state.status !== 'running' || !state.config || !state.transcript || isRunning.current) return;
    
    isRunning.current = true;
    const { config, transcript, currentPhase } = state;
    const currentTurnNumber = transcript.turns.length;

    try {
        if (currentPhase === 'asking') {
            const teacherHistory = constructTeacherHistory(transcript.turns);
            dispatch({ type: 'SET_ACTIVITY', payload: { message: `Contacting the teacher for question ${currentTurnNumber + 1}…` } });
            await withRetry(async () => {
                const prompt = getTeacherQuestionPrompt(currentTurnNumber + 1);
                const { rawRequest, rawResponse } = await runTeacherTurn({
                    prompt,
                    teacherConfig: config.teacher,
                    history: teacherHistory,
                    gradingScale: config.gradingScale,
                });
                
                const { thinking } = parseWithThinking(rawResponse, config.teacher);
                const toolCall = rawResponse.tool_calls ? rawResponse.tool_calls[0] : null;

                if (toolCall?.function.name === 'askQuestion') {
                    const args = JSON.parse(toolCall.function.arguments);
                    dispatch({ type: 'PROCESS_TEACHER_QUESTION', payload: { question: args.next_question, rawRequest, rawResponse, thinking, tool_calls: rawResponse.tool_calls || [] } });
                } else {
                    throw new Error("Teacher failed to call the 'askQuestion' tool when expected.");
                }
            }, 5, 3000, (message) => dispatch({ type: 'SET_ACTIVITY', payload: { message } }));
        } 
        else if (currentPhase === 'answering') {
            const completedTurns = transcript.turns.slice(0, currentTurnNumber - 1);
            const lastTurn = transcript.turns[currentTurnNumber - 1];
            
            dispatch({ type: 'SET_ACTIVITY', payload: { message: 'Contacting the student for an answer…' } });
            await withRetry(async () => {
                const studentPrompt = getStudentPrompt(completedTurns, lastTurn.question, currentTurnNumber);
                const { rawRequest, rawResponse } = await runStudentTurn({
                    prompt: studentPrompt,
                    studentConfig: config.student,
                });
                const { clean: studentAnswer, thinking } = parseWithThinking(rawResponse, config.student);

                if (studentAnswer) {
                    dispatch({ type: 'PROCESS_STUDENT_ANSWER', payload: { answer: studentAnswer, rawRequest, rawResponse, thinking } });
                } else {
                    throw new Error("Student returned an empty response.");
                }
            }, 5, 3000, (message) => dispatch({ type: 'SET_ACTIVITY', payload: { message } }));
        }
        else if (currentPhase === 'evaluating') {
            const lastTurn = transcript.turns[transcript.turns.length - 1];
            const teacherHistory = constructTeacherHistory(transcript.turns);
            dispatch({ type: 'SET_ACTIVITY', payload: { message: 'Contacting the teacher for an evaluation…' } });
            await withRetry(async () => {
                const prompt = getTeacherEvaluationPrompt(lastTurn);
                const { rawRequest, rawResponse } = await runTeacherTurn({
                    prompt,
                    teacherConfig: config.teacher,
                    history: teacherHistory,
                    gradingScale: config.gradingScale,
                });
                
                const { thinking } = parseWithThinking(rawResponse, config.teacher);
                const toolCall = rawResponse.tool_calls ? rawResponse.tool_calls[0] : null;

                if (toolCall?.function.name === 'provideEvaluation') {
                    const args = JSON.parse(toolCall.function.arguments);
                    const evaluation: Evaluation = {
                        rank: args.grade,
                        reason: args.reason,
                        message_to_student: args.message_to_student,
                    };
                    dispatch({ type: 'PROCESS_TEACHER_EVALUATION', payload: { evaluation, rawRequest, rawResponse, thinking, tool_calls: rawResponse.tool_calls || [] } });
                } else {
                    throw new Error("Teacher failed to call the 'provideEvaluation' tool when expected.");
                }
            }, 5, 3000, (message) => dispatch({ type: 'SET_ACTIVITY', payload: { message } }));
        }
        else if (currentPhase === 'summarizing') {
             const teacherHistory = constructTeacherHistory(transcript.turns);
             dispatch({ type: 'SET_ACTIVITY', payload: { message: 'Contacting the teacher for the final report…' } });
             await withRetry(async () => {
                const prompt = getTeacherSummaryPrompt();
                const { rawRequest, rawResponse } = await runTeacherTurn({
                    prompt,
                    teacherConfig: config.teacher,
                    history: teacherHistory,
                    gradingScale: config.gradingScale,
                });
                
                const toolCall = rawResponse.tool_calls ? rawResponse.tool_calls[0] : null;

                if (toolCall?.function.name === 'provideSummary') {
                    const args = JSON.parse(toolCall.function.arguments);
                    dispatch({ type: 'SET_FINAL_SUMMARY', payload: { summary: args.final_summary, rawRequest, rawResponse }});
                    dispatch({ type: 'FINISH_EXAM' });
                } else {
                   throw new Error("Teacher failed to call the 'provideSummary' tool when expected.");
                }
            }, 5, 3000, (message) => dispatch({ type: 'SET_ACTIVITY', payload: { message } }));
        }

    } catch (e: any) {
        console.error("Error during examination phase:", e);
        const detailedError = e.message || 'An unknown error occurred.';
        const status = e.status ? ` (API Status: ${e.status})` : '';
        dispatch({ type: 'ADD_ERROR', payload: { error: `${detailedError}${status}` }});
    } finally {
        isRunning.current = false;
    }

  }, [state]);

  useEffect(() => {
    if (state.status === 'running') {
        const timer = setTimeout(() => {
            runPhase();
        }, 100);
        return () => clearTimeout(timer);
    }
  }, [state.status, state.currentPhase, state.transcript, runPhase]);

  return { state, dispatch };
}
