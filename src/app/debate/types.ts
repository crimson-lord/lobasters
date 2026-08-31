import type OpenAI from "openai";

// Static types for the debate engine

export type AgentID = 'A' | 'B';
export type ReasoningCaptureMethod = 'none' | 'tags' | 'field' | 'all';
export type SpeakingStyle =
  | 'witty'
  | 'professional'
  | 'street'
  | 'academic'
  | 'aggressive'
  | 'neutral';
export type Depth = 'low' | 'medium' | 'high';
export type Winner = AgentID | 'draw' | null;

export type ScenarioType = 'sales' | 'hiring' | 'debate' | 'custom' | null;

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  systemResponse: string; // What the system tells the agent when the tool is called
  parameterSchema?: string; // JSON string for tool parameters
  sendToOpponent?: boolean; // If true, the call and result are shown to the opponent
  triggerWinner?: AgentID | 'SELF' | 'OPPONENT' | null; // If set, calling this tool ends the debate and sets the winner
}

export interface AgentConfig {
  nickname: string;
  modelName: string;
  baseURL: string;
  apiKey?: string;
  temperature: number;
  maxTokens?: number;
  maxHistory?: number;
  systemPrompt: string;
  speakingStyle: SpeakingStyle;
  depth: Depth;
  canThink: boolean; 
  reasoningCaptureMethod: ReasoningCaptureMethod;
  reasoningField: string;
  startTag: string;
  endTag: string;
  manualContent: string;
  enableManualTool: boolean;
  enableGiveUp: boolean;
  customTools: ToolDefinition[];
}

export interface DebateConfig {
  topic: string;
  extraRules: string;
  agentSpeaksFirst: AgentID;
  agentIsPro: AgentID;
  agentA: AgentConfig;
  agentB: AgentConfig;
  scenarioType: ScenarioType;
}

export interface Message {
  id: number;
  author: AgentID | 'SYSTEM';
  role: 'assistant' | 'user' | 'system' | 'tool';
  content: string;
  isThinking?: boolean;
  isLoading?: boolean; // Transient loading state
  privateReasoning?: string | null;
  reasoningUsedAsContent?: boolean;
  responseNotice?: string | null;
  rawRequest?: any | null;
  rawResponse?: any | null;
  tool_call_id?: string; // For tool responses
  intendedFor?: AgentID | 'ALL'; // Visibility control
}

// Represents a message in the format expected by the OpenAI API
export type ApiMessage = OpenAI.Chat.ChatCompletionMessageParam;

// The structured response we get from parsing the model's output
export interface DebateResponse {
  thinking: string | null;
  speak: string;
  usedReasoningAsSpeech: boolean;
  rawRequest: any;
  rawResponse: any;
}

// The part of the response that is parsed from the raw text
export interface ParsedDebateResponse {
  thinking: string | null;
  speak: string;
  usedReasoningAsSpeech: boolean;
}

export interface DebateState {
  messages: Message[];
  currentTurn: AgentID;
  isDebating: boolean;
  winner: Winner;
  errorCount: number;
  config: DebateConfig | null; // Engine stores its own config to prevent stale state issues
}

// Reducer action types
export type DebateAction =
  | { type: 'START_DEBATE'; payload: { config: DebateConfig } }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: Partial<Message> & { id: number } }
  | { type: 'END_DEBATE'; payload: { winner: Winner } }
  | { type: 'GIVE_UP'; payload: { winner: Winner; reason: string; givingUpAgent: AgentID | 'SYSTEM' } }
  | { type: 'SWITCH_TURN' }
  | { type: 'RESET'; payload: { agentSpeaksFirst: AgentID } }
  | { type: 'ADD_ERROR'; payload: { error: string } };
