import type OpenAI from 'openai';

export type ReasoningCaptureMethod = 'none' | 'tags' | 'field' | 'all';

/**
 * Base configuration for an agent.
 */
export interface ProvingGroundAgentConfig {
  nickname: string;
  modelName: string;
  baseURL: string;
  apiKey?: string;
  temperature: number;
  maxTokens?: number;
  maxHistory?: number;
  systemPrompt: string;
  canThink: boolean; // New Field
  reasoningCaptureMethod: ReasoningCaptureMethod;
  reasoningField: string;
  startTag: string;
  endTag: string;
}

export type GradingScale = 'SABF' | 'ABF' | 'AF' | 'SAF';

/**
 * Defines the possible evaluation ranks the Teacher can assign.
 */
export type EvaluationRank = 'S' | 'A' | 'B' | 'F';

/**
 * Represents the structured evaluation from the Teacher model.
 */
export interface Evaluation {
    rank: EvaluationRank;
    reason: string;
    message_to_student: string | null;
}

/**
 * Configuration for the entire Proving Ground examination.
 */
export interface ProvingGroundConfig {
  teacher: ProvingGroundAgentConfig;
  student: ProvingGroundAgentConfig;
  domains: string[];
  questionCount: number;
  gradingScale: GradingScale;
}

/**
 * Represents a single turn within the examination.
 */
export interface Turn {
  turnNumber: number;
  question: string;
  answer: string;
  evaluation: Evaluation | null; // Can be null until the teacher evaluates it
  teacherThinking: string | null;
  studentThinking: string | null;
  rawQuestionRequest: any | null;
  rawQuestionResponse: any | null;
  rawAnswerRequest: any | null;
  rawAnswerResponse: any | null;
  rawEvaluationRequest: any | null;
  rawEvaluationResponse: any | null;
  rawSummaryRequest?: any | null;
  rawSummaryResponse?: any | null;
}

/**
 * The final, exportable artifact that represents the entire examination.
 */
export interface ProvingGroundTranscript {
  config: ProvingGroundConfig;
  startedAt: string; // ISO 8601 timestamp
  finishedAt: string; // ISO 8601 timestamp
  turns: Turn[];
  finalSummary: string;
}

export type ExamPhase = 'asking' | 'answering' | 'evaluating' | 'summarizing';


// Represents a message in the format expected by the OpenAI API
export type ApiMessage = OpenAI.Chat.ChatCompletionMessageParam;

// Represents the output from a model that may include tool calls
export interface ModelOutput {
    rawResponse: OpenAI.Chat.ChatCompletionMessage;
    rawRequest: any;
}

/**
 * Represents the state of the examination as it runs.
 */
export interface ProvingGroundState {
  config: ProvingGroundConfig | null;
  transcript: ProvingGroundTranscript | null;
  status: 'configuring' | 'running' | 'finished' | 'error';
  currentPhase: ExamPhase;
  error?: string;
  errorCount: number;
}

export type ProvingGroundAction =
  | { type: 'START_EXAM'; payload: { config: ProvingGroundConfig } }
  | { type: 'PROCESS_TEACHER_QUESTION'; payload: { question: string; rawRequest: any; rawResponse: any, thinking: string | null, tool_calls: OpenAI.Chat.ChatCompletionMessageToolCall[] } }
  | { type: 'PROCESS_STUDENT_ANSWER'; payload: { answer: string; rawRequest: any; rawResponse: any, thinking: string | null } }
  | { type: 'PROCESS_TEACHER_EVALUATION'; payload: { evaluation: Evaluation; rawRequest: any; rawResponse: any, thinking: string | null, tool_calls: OpenAI.Chat.ChatCompletionMessageToolCall[] } }
  | { type: 'SET_FINAL_SUMMARY'; payload: { summary: string; rawRequest: any; rawResponse: any; } }
  | { type: 'FINISH_EXAM' }
  | { type: 'SET_ERROR'; payload: { error: string } }
  | { type: 'ADD_ERROR'; payload: { error: string } }
  | { type: 'RESET' };
