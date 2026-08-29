'use client';

import type OpenAI from 'openai';

export type VirtualFileId = string;
export type ReasoningCaptureMethod = 'none' | 'tags' | 'field' | 'all';
export type QuestionSource = 'agent' | 'user';


export interface HistoryEntry {
    turnNumber: number;
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
}

/**
 * Represents a single virtual file in the agent's filesystem.
 */
export interface VirtualFile {
    id: VirtualFileId;
    content: string;
}

/**
 * Represents a message logged in the Hub from a helper agent.
 */
export interface HubMessage {
    id: string; // Unique ID for the message
    agentId: string; // ID of the LLM connection (e.g., 'llm-1')
    agentNickname: string;
    content: string;
    timestamp: string; // ISO string
}

/**
 * Base configuration for an agent in LM0.
 */
export interface LM0AgentConfig {
    modelName: string;
    baseURL: string;
    apiKey?: string;
    temperature: number;
    systemPrompt: string;
    canThink: boolean; // New Field
    reasoningCaptureMethod: ReasoningCaptureMethod;
    reasoningField: string;
    startTag: string;
    endTag: string;
    maxHistory?: number;
}


/**
 * Configuration for a subordinate LLM that the Master Agent can use as a tool.
 */
export interface LLMConnectionConfig extends LM0AgentConfig {
    id: string; // e.g., 'llm-1', 'llm-2'
    nickname: string;
    maxTokens?: number;
}

/**
 * The main configuration for the entire LM0 session.
 */
export interface LM0Config {
    challengeCount: number;
    masterAgent: LM0AgentConfig;
    llmConnections: LLMConnectionConfig[];
    questionSource: QuestionSource;
    questionBankContent: string;
    manualContent: string;
    allowHelperAgents: boolean;
    allowedFiles: VirtualFileId[];
    useCustomPrompts: boolean;
    systemPromptTemplate: string;
    turnPromptTemplate: string;
}

/**
 * Represents the status and content of a single challenge.
 */
export interface Challenge {
    challengeNumber: number;
    question: string;
    submittedAnswer: string | null;
    isCompleted: boolean;
    finalAnswer: string | null;
}

/**
 * A complete, serializable snapshot of the mutable LAB runtime at the start of
 * a turn. Configuration is intentionally kept outside the checkpoint because
 * it is immutable for the lifetime of a session.
 */
export interface LM0Checkpoint {
    turnNumber: number;
    virtualFiles: Record<VirtualFileId, VirtualFile>;
    challenges: Challenge[];
    hubMessages: HubMessage[];
    history: HistoryEntry[];
    log: string[];
    errors: string[];
    errorCount: number;
    error?: string;
    sessionStartTime: number | null;
    lastHelperAgentUseTime: number | null;
    lastManualReadTime: number | null;
    messagesToMe: string[];
    queuedResearcherInstruction: string | null;
}

/**
 * Represents the entire state of the LM0 engine.
 */
export interface LM0State {
    config: LM0Config | null;
    status: 'configuring' | 'running' | 'paused' | 'finished' | 'error';
    error?: string;
    
    // Agent's internal state
    virtualFiles: Record<VirtualFileId, VirtualFile>;
    challenges: Challenge[];
    hubMessages: HubMessage[];
    
    // Log of operations
    history: HistoryEntry[]; // Full API history for debugging and raw display
    log: string[]; // A simple log of human-readable events
    errors: string[]; // A list of errors encountered
    errorCount: number;
    
    // New state for advanced agent loop
    turnNumber: number;
    sessionStartTime: number | null; // unix timestamp
    lastHelperAgentUseTime: number | null; // unix timestamp
    lastManualReadTime: number | null; // unix timestamp
    messagesToMe: string[]; // Stores the history of "message to me" self-directions
    queuedResearcherInstruction: string | null;
    turnCheckpoints: Record<number, LM0Checkpoint>;
    runRevision: number; // Scheduler nonce used to rerun the same turn after rollback.
}

export type LM0Action =
  | { type: 'START_SESSION'; payload: { config: LM0Config } }
  | { type: 'PAUSE_SESSION' }
  | { type: 'RESUME_SESSION' }
  | { type: 'FINISH_SESSION' }
  | { type: 'SET_ERROR'; payload: { error: string } }
  | { type: 'ADD_ERROR'; payload: { error: string } }
  | { type: 'RESET' }
  | { type: 'ADD_LOG'; payload: { message: string } }
  | { type: 'ADD_HISTORY'; payload: { entry: HistoryEntry } }
  | { type: 'ADD_MESSAGE_TO_ME'; payload: { message: string } }
  | { type: 'CLEAR_CONSECUTIVE_ERRORS' }
  | { type: 'ROLLBACK_TO_TURN'; payload: { turnNumber: number } }
  | { type: 'RESTORE_CHECKPOINT'; payload: { checkpoint: LM0Checkpoint; status?: 'running' | 'paused' } }
  | { type: 'QUEUE_RESEARCHER_INSTRUCTION'; payload: { instruction: string } }
  | { type: 'CONSUME_RESEARCHER_INSTRUCTION' }
  | { type: 'UPDATE_VIRTUAL_FILE'; payload: { fileId: VirtualFileId; content: string } }
  | { type: 'ADD_HUB_MESSAGE'; payload: { message: HubMessage } }
  | { type: 'MARK_CHALLENGE_DONE'; payload: { challengeNumber: number } }
  | { type: 'UPLOAD_QUESTION', payload: { challengeNumber: number; content: string } }
  | { type: 'UPLOAD_ANSWER', payload: { challengeNumber: number; fileId: VirtualFileId } }
  | { type: 'SET_CHALLENGE_QUESTION'; payload: { challengeNumber: number; question: string } }
  | { type: 'START_NEXT_TURN' }
  | { type: 'UPDATE_TIMER'; payload: { timer: 'lastHelperAgentUseTime' | 'lastManualReadTime' } };
