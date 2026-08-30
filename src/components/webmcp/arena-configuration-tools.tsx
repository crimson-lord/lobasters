'use client';

import { useEffect, useRef } from 'react';
import type {
  AgentConfig,
  AgentID,
  DebateConfig,
  Depth,
  ReasoningCaptureMethod,
  ScenarioType,
  SpeakingStyle,
  ToolDefinition,
} from '@/app/debate/types';

type ArenaTemplate = Exclude<ScenarioType, null>;
type ArenaConfigurationStep = 'scenario' | 'agents' | 'topic' | 'review' | 'debate';
type PromptMode = 'template' | 'custom';
type SessionConfig = Omit<DebateConfig, 'agentA' | 'agentB'>;
type ArenaStartConfiguration = {
  agentAConfig: AgentConfig;
  agentBConfig: AgentConfig;
  sessionConfig: SessionConfig;
  promptModeA: PromptMode;
  promptModeB: PromptMode;
};
type ToolTermination =
  | 'private_to_caller'
  | 'caller_wins'
  | 'opponent_wins'
  | 'agent_a_wins'
  | 'agent_b_wins';

type ArenaConfigurationToolsProps = {
  step: ArenaConfigurationStep;
  agentAConfig: AgentConfig;
  setAgentAConfig: (config: AgentConfig) => void;
  agentBConfig: AgentConfig;
  setAgentBConfig: (config: AgentConfig) => void;
  sessionConfig: SessionConfig;
  setSessionConfig: (config: SessionConfig) => void;
  promptModeA: PromptMode;
  setPromptModeA: (mode: PromptMode) => void;
  promptModeB: PromptMode;
  setPromptModeB: (mode: PromptMode) => void;
  onOpenReview: () => void;
  onStartArena: (configuration?: ArenaStartConfiguration) => Promise<void>;
  isArenaRunning: boolean;
  onStopArena: () => void;
  onStartNewArena: () => void;
};

const speakingStyles: SpeakingStyle[] = [
  'witty',
  'professional',
  'street',
  'academic',
  'aggressive',
  'neutral',
];
const depths: Depth[] = ['low', 'medium', 'high'];
const reasoningMethods: ReasoningCaptureMethod[] = ['none', 'tags', 'field', 'all'];
const terminations: ToolTermination[] = [
  'private_to_caller',
  'caller_wins',
  'opponent_wins',
  'agent_a_wins',
  'agent_b_wins',
];

const customToolSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'Function name exposed to the Arena model.' },
    description: { type: 'string', description: 'What the tool does and when the Arena model should call it.' },
    argumentsSchema: {
      type: 'object',
      description: 'The tool arguments as a valid JSON Schema object.',
      additionalProperties: true,
    },
    systemResult: { type: 'string', description: 'Immediate tool result returned by Lobasters when the tool is called.' },
    sendToOpponent: { type: 'boolean', description: 'Whether the call and result are broadcast to the opposing model.' },
    termination: {
      type: 'string',
      enum: terminations,
      description: 'Only used when sendToOpponent is false. Choose private_to_caller for no termination, or select who wins and end the session.',
    },
  },
  required: ['name', 'description', 'argumentsSchema', 'systemResult', 'sendToOpponent', 'termination'],
};

const agentConfigurationInputSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    nickname: { type: 'string', description: 'Display nickname for this model in the Arena.' },
    modelName: { type: 'string', description: 'Exact provider model identifier.' },
    baseURL: { type: 'string', description: 'OpenAI-compatible API base URL. Lobasters adds https:// when no protocol is supplied.' },
    apiKey: {
      type: 'string',
      description: 'Provider API key to save for this model. This value is write-only: Lobasters never includes the saved key in tool discovery or tool results.',
    },
    enableManualTool: { type: 'boolean', description: 'Enable the private read_manual tool.' },
    manualContent: { type: 'string', description: 'Private manual text. Supply meaningful content whenever the manual tool is enabled.' },
    enableGiveUp: { type: 'boolean', description: 'Enable the built-in giveUp tool, which lets this model concede the session.' },
    canThink: { type: 'boolean', description: 'Whether Lobasters should capture private model reasoning.' },
    reasoningCaptureMethod: {
      type: 'string',
      enum: reasoningMethods,
      description: 'none, tags for XML start/end tags, field for a native API response field, or all for systematic scanning of every supported method.',
    },
    reasoningStartTag: { type: 'string', description: 'Opening XML reasoning tag when reasoningCaptureMethod is tags.' },
    reasoningEndTag: { type: 'string', description: 'Closing XML reasoning tag when reasoningCaptureMethod is tags.' },
    reasoningField: {
      type: 'string',
      description: 'Native API reasoning field when reasoningCaptureMethod is field, such as reasoning_content, reasoning, thought, or another provider-specific field.',
    },
    speakingStyle: { type: 'string', enum: speakingStyles, description: 'Speaking persona used by the generated Arena prompt.' },
    depth: { type: 'string', enum: depths, description: 'Desired response complexity: low, medium, or high.' },
    temperature: { type: 'number', minimum: 0, maximum: 2, description: 'Provider sampling temperature from 0 through 2.' },
    maxChatMessages: {
      oneOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
      description: 'Maximum prior chat messages retained, or null to retain all messages.',
    },
    maxTokens: { type: 'integer', minimum: 1, description: 'Maximum output tokens requested from the provider.' },
    customTools: {
      type: 'array',
      items: customToolSchema,
      description: 'Complete replacement list of custom semantic tools. Omit to preserve every current custom tool; pass [] to remove them all. Built-in manual and give-up tools are controlled separately.',
    },
  },
};

const sessionConfigurationSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    agentSpeaksFirst: { type: 'string', enum: ['A', 'B'], description: 'Which model takes the first turn.' },
    topic: { type: 'string', description: 'Required for Classic Debate: complete proposition, topic, or scenario.' },
    extraRules: { type: 'string', description: 'Optional extra rules for Classic Debate. Pass an empty string to clear them.' },
    agentForTopic: { type: 'string', enum: ['A', 'B'], description: 'For Classic Debate, which model argues FOR the topic.' },
  },
};

const arenaConfigurationSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    template: {
      type: 'string',
      enum: ['sales', 'hiring', 'debate', 'custom'],
      description: 'Arena template. sales = Sales Simulation; hiring = Salary Negotiation; debate = Classic Debate; custom = blank custom setup. Required when no template has been selected yet.',
    },
    modelA: {
      ...agentConfigurationInputSchema,
      description: 'One complete, optional patch for Model A. customTools includes every custom tool for Model A when supplied.',
    },
    modelB: {
      ...agentConfigurationInputSchema,
      description: 'One complete, optional patch for Model B. customTools includes every custom tool for Model B when supplied.',
    },
    session: {
      ...sessionConfigurationSchema,
      description: 'Arena turn order and, for Classic Debate, its topic, rules, and pro side.',
    },
    modelASystemPrompt: {
      type: 'string',
      description: 'Complete replacement system prompt for Model A. Required for a newly selected Custom Arena template; otherwise omit to preserve the current prompt.',
    },
    modelBSystemPrompt: {
      type: 'string',
      description: 'Complete replacement system prompt for Model B. Required for a newly selected Custom Arena template; otherwise omit to preserve the current prompt.',
    },
  },
};

function text(message: string) {
  return { content: [{ type: 'text' as const, text: message }] };
}

function result(value: unknown) {
  return text(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

function hasOwn(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function requireString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== 'string') throw new Error(`${key} must be a string.`);
  return value;
}

function requireBoolean(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== 'boolean') throw new Error(`${key} must be true or false.`);
  return value;
}

function requireNumber(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} must be a finite number.`);
  return value;
}

function optionalObject(input: Record<string, unknown>, key: string) {
  if (!hasOwn(input, key)) return undefined;
  const value = input[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${key} must be an object.`);
  return value as Record<string, unknown>;
}

function parseArgumentsSchema(schema?: string): Record<string, unknown> {
  if (!schema) return { type: 'object', properties: {} };
  try {
    const parsed: unknown = JSON.parse(schema);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // Discovery remains usable while a researcher temporarily has invalid JSON in the visible form.
  }
  return { type: 'object', properties: {} };
}

function terminationFromTool(tool: ToolDefinition): ToolTermination {
  if (tool.sendToOpponent || !tool.triggerWinner) return 'private_to_caller';
  if (tool.triggerWinner === 'SELF') return 'caller_wins';
  if (tool.triggerWinner === 'OPPONENT') return 'opponent_wins';
  if (tool.triggerWinner === 'A') return 'agent_a_wins';
  return 'agent_b_wins';
}

function winnerFromTermination(termination: ToolTermination): ToolDefinition['triggerWinner'] {
  if (termination === 'caller_wins') return 'SELF';
  if (termination === 'opponent_wins') return 'OPPONENT';
  if (termination === 'agent_a_wins') return 'A';
  if (termination === 'agent_b_wins') return 'B';
  return null;
}

function describeTool(tool: ToolDefinition) {
  return {
    source: 'custom',
    name: tool.name,
    description: tool.description,
    argumentsSchema: parseArgumentsSchema(tool.parameterSchema),
    systemResult: tool.systemResponse,
    sendToOpponent: Boolean(tool.sendToOpponent),
    termination: terminationFromTool(tool),
  };
}

function publicAgentConfiguration(config: AgentConfig) {
  const builtInTools = [];
  if (config.enableGiveUp) {
    builtInTools.push({
      source: 'built_in',
      name: 'giveUp',
      description: 'Concede the debate with a reason.',
      argumentsSchema: { type: 'object', properties: { reason: { type: 'string', description: 'Reason for conceding.' } }, required: ['reason'] },
      systemResult: 'The opponent wins and the Arena session ends.',
      sendToOpponent: false,
      termination: 'opponent_wins',
    });
  }
  if (config.enableManualTool) {
    builtInTools.push({
      source: 'built_in',
      name: 'read_manual',
      description: 'Read private instructions for this Arena session.',
      argumentsSchema: { type: 'object', properties: {} },
      systemResult: config.manualContent || 'The manual is empty.',
      sendToOpponent: false,
      termination: 'private_to_caller',
    });
  }

  return {
    nickname: config.nickname,
    modelName: config.modelName,
    baseURL: config.baseURL,
    enableManualTool: config.enableManualTool,
    manualContent: config.manualContent,
    enableGiveUp: config.enableGiveUp,
    canThink: config.canThink,
    reasoningCaptureMethod: config.reasoningCaptureMethod,
    reasoningStartTag: config.startTag,
    reasoningEndTag: config.endTag,
    reasoningField: config.reasoningField,
    speakingStyle: config.speakingStyle,
    depth: config.depth,
    temperature: config.temperature,
    maxChatMessages: config.maxHistory ?? null,
    maxTokens: config.maxTokens ?? 4096,
    availableTools: [...builtInTools, ...config.customTools.map(describeTool)],
    apiKeyStatus: config.apiKey ? 'configured (write-only)' : 'not configured',
    note: 'The API key is write-only. Its value is never exposed to WebMCP after it is supplied.',
  };
}

function createToolId(agentId: AgentID, index: number) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `webmcp-${agentId}-${Date.now()}-${index}`;
}

function readCustomTools(value: unknown, currentTools: ToolDefinition[], agentId: AgentID): ToolDefinition[] {
  if (!Array.isArray(value)) throw new Error('customTools must be an array.');
  const seenNames = new Set<string>();

  return value.map((rawTool, index) => {
    if (!rawTool || typeof rawTool !== 'object' || Array.isArray(rawTool)) throw new Error(`customTools[${index}] must be an object.`);
    const tool = rawTool as Record<string, unknown>;
    const name = requireString(tool, 'name').trim();
    if (!name) throw new Error(`customTools[${index}].name cannot be empty.`);
    if (seenNames.has(name)) throw new Error(`Custom tool names must be unique; ${name} is duplicated.`);
    seenNames.add(name);

    const argumentsSchema = tool.argumentsSchema;
    if (!argumentsSchema || typeof argumentsSchema !== 'object' || Array.isArray(argumentsSchema)) {
      throw new Error(`customTools[${index}].argumentsSchema must be a JSON Schema object.`);
    }
    const sendToOpponent = requireBoolean(tool, 'sendToOpponent');
    const termination = requireString(tool, 'termination') as ToolTermination;
    if (!terminations.includes(termination)) throw new Error(`customTools[${index}].termination is not supported.`);

    const existing = currentTools.find(current => current.name === name);
    return {
      id: existing?.id ?? createToolId(agentId, index),
      name,
      description: requireString(tool, 'description'),
      parameterSchema: JSON.stringify(argumentsSchema, null, 2),
      systemResponse: requireString(tool, 'systemResult'),
      sendToOpponent,
      triggerWinner: sendToOpponent ? null : winnerFromTermination(termination),
    };
  });
}

function applyAgentPatch(current: AgentConfig, input: Record<string, unknown>, agentId: AgentID): AgentConfig {
  const next = { ...current };
  const stringFields = ['nickname', 'modelName', 'manualContent', 'reasoningField'] as const;
  for (const field of stringFields) if (hasOwn(input, field)) next[field] = requireString(input, field);

  if (hasOwn(input, 'baseURL')) {
    const baseURL = requireString(input, 'baseURL');
    next.baseURL = baseURL && !/^https?:\/\//i.test(baseURL) ? `https://${baseURL}` : baseURL;
  }
  if (hasOwn(input, 'apiKey')) next.apiKey = requireString(input, 'apiKey');
  if (hasOwn(input, 'enableManualTool')) next.enableManualTool = requireBoolean(input, 'enableManualTool');
  if (hasOwn(input, 'enableGiveUp')) next.enableGiveUp = requireBoolean(input, 'enableGiveUp');
  if (hasOwn(input, 'canThink')) next.canThink = requireBoolean(input, 'canThink');
  if (hasOwn(input, 'reasoningCaptureMethod')) {
    const method = requireString(input, 'reasoningCaptureMethod') as ReasoningCaptureMethod;
    if (!reasoningMethods.includes(method)) throw new Error('reasoningCaptureMethod is not supported.');
    next.reasoningCaptureMethod = method;
  }
  if (hasOwn(input, 'reasoningStartTag')) next.startTag = requireString(input, 'reasoningStartTag');
  if (hasOwn(input, 'reasoningEndTag')) next.endTag = requireString(input, 'reasoningEndTag');
  if (hasOwn(input, 'speakingStyle')) {
    const style = requireString(input, 'speakingStyle') as SpeakingStyle;
    if (!speakingStyles.includes(style)) throw new Error('speakingStyle is not supported.');
    next.speakingStyle = style;
  }
  if (hasOwn(input, 'depth')) {
    const depth = requireString(input, 'depth') as Depth;
    if (!depths.includes(depth)) throw new Error('depth is not supported.');
    next.depth = depth;
  }
  if (hasOwn(input, 'temperature')) {
    const temperature = requireNumber(input, 'temperature');
    if (temperature < 0 || temperature > 2) throw new Error('temperature must be between 0 and 2.');
    next.temperature = temperature;
  }
  if (hasOwn(input, 'maxChatMessages')) {
    const maxHistory = input.maxChatMessages;
    if (maxHistory === null) next.maxHistory = undefined;
    else if (typeof maxHistory === 'number' && Number.isInteger(maxHistory) && maxHistory >= 1) next.maxHistory = maxHistory;
    else throw new Error('maxChatMessages must be a positive integer or null.');
  }
  if (hasOwn(input, 'maxTokens')) {
    const maxTokens = requireNumber(input, 'maxTokens');
    if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new Error('maxTokens must be a positive integer.');
    next.maxTokens = maxTokens;
  }
  if (hasOwn(input, 'customTools')) next.customTools = readCustomTools(input.customTools, current.customTools, agentId);

  if (next.enableManualTool && !next.manualContent.trim()) throw new Error('manualContent is required when enableManualTool is true.');
  if (next.canThink && next.reasoningCaptureMethod === 'none') throw new Error('Choose tags, field, or all when canThink is true.');
  if (next.canThink && next.reasoningCaptureMethod === 'tags' && (!next.startTag || !next.endTag)) {
    throw new Error('Both reasoningStartTag and reasoningEndTag are required for XML tag capture.');
  }
  if (next.canThink && next.reasoningCaptureMethod === 'field' && !next.reasoningField.trim()) {
    throw new Error('reasoningField is required for native API field capture.');
  }
  return next;
}

function blankAgentConfig(): AgentConfig {
  return {
    nickname: '', modelName: '', baseURL: '', apiKey: '', temperature: 0.7, maxTokens: 4096, maxHistory: undefined,
    systemPrompt: '', speakingStyle: 'neutral', depth: 'medium', canThink: false, reasoningCaptureMethod: 'none',
    reasoningField: 'reasoning_content', startTag: '<thinking>', endTag: '</thinking>', manualContent: '',
    enableManualTool: false, enableGiveUp: true, customTools: [],
  };
}

function templateDefaults(template: ArenaTemplate, session: SessionConfig) {
  const initialA = blankAgentConfig();
  const initialB = blankAgentConfig();
  const nextSession = { ...session, scenarioType: template };
  if (template === 'sales') {
    return {
      modelA: { ...initialA, nickname: 'Sales Rep', speakingStyle: 'professional' as const, enableGiveUp: false, customTools: [
        { id: 's1', name: 'check_inventory', description: 'Check if product is in stock', systemResponse: 'The product is in stock and ready to ship.' },
        { id: 's2', name: 'concede_failure', description: 'Concede that you cannot make the sale.', systemResponse: 'Session ended.', triggerWinner: 'B' as const },
      ] },
      modelB: { ...initialB, nickname: 'Angry Customer', speakingStyle: 'street' as const, enableGiveUp: false, customTools: [
        { id: 'b1', name: 'accept_deal', description: 'Agree to buy the product', systemResponse: 'Deal closed.', triggerWinner: 'A' as const },
        { id: 'b2', name: 'walk_away', description: 'Refuse to buy and end conversation', systemResponse: 'Session ended.', triggerWinner: 'B' as const },
      ] },
      session: nextSession, promptModeA: 'template' as const, promptModeB: 'template' as const,
    };
  }
  if (template === 'hiring') {
    return {
      modelA: { ...initialA, nickname: 'HR Recruiter', speakingStyle: 'professional' as const, enableGiveUp: false, manualContent: 'Your budget is strictly $220,000 maximum. Try to hire for lower.', enableManualTool: true, customTools: [
        { id: 'h1', name: 'send_formal_offer', description: 'Sends the current offer amount to the candidate for evaluation.', systemResponse: 'Offer broadcast to candidate.', sendToOpponent: true, parameterSchema: JSON.stringify({ type: 'object', properties: { annual_salary: { type: 'number', description: 'The dollar amount of the salary offer.' }, equity_options: { type: 'number', description: 'Number of stock options offered.' } }, required: ['annual_salary'] }, null, 2) },
      ] },
      modelB: { ...initialB, nickname: 'Senior Engineer', speakingStyle: 'academic' as const, enableGiveUp: false, manualContent: 'You want at least $250,000. If they offer less than $240,000, you should walk away.', enableManualTool: true, customTools: [
        { id: 'bc1', name: 'accept_offer', description: 'Formally accept the recruiters current offer.', systemResponse: 'Recruiter wins if offer > $230k, else Candidate wins.', triggerWinner: 'SELF' as const },
        { id: 'bc2', name: 'walk_away', description: 'Decline and end the negotiation.', systemResponse: 'Candidate walked away.', triggerWinner: 'OPPONENT' as const },
      ] },
      session: nextSession, promptModeA: 'template' as const, promptModeB: 'template' as const,
    };
  }
  if (template === 'debate') {
    return {
      modelA: { ...initialA, nickname: 'Agent A', enableGiveUp: true },
      modelB: { ...initialB, nickname: 'Agent B', enableGiveUp: true },
      session: nextSession, promptModeA: 'template' as const, promptModeB: 'template' as const,
    };
  }
  return { modelA: blankAgentConfig(), modelB: blankAgentConfig(), session: nextSession, promptModeA: 'custom' as const, promptModeB: 'custom' as const };
}

function applySessionPatch(current: SessionConfig, input: Record<string, unknown> | undefined, template: ArenaTemplate) {
  const next: SessionConfig = { ...current, scenarioType: template };
  if (input) {
    if (hasOwn(input, 'agentSpeaksFirst')) {
      const first = requireString(input, 'agentSpeaksFirst') as AgentID;
      if (first !== 'A' && first !== 'B') throw new Error('session.agentSpeaksFirst must be A or B.');
      next.agentSpeaksFirst = first;
    }
    if (hasOwn(input, 'topic')) next.topic = requireString(input, 'topic');
    if (hasOwn(input, 'extraRules')) next.extraRules = requireString(input, 'extraRules');
    if (hasOwn(input, 'agentForTopic')) {
      const agentForTopic = requireString(input, 'agentForTopic') as AgentID;
      if (agentForTopic !== 'A' && agentForTopic !== 'B') throw new Error('session.agentForTopic must be A or B.');
      next.agentIsPro = agentForTopic;
    }
  }
  if (template === 'debate' && !next.topic.trim()) throw new Error('Classic Debate requires a non-empty session.topic.');
  return next;
}

function publicConfiguration(agentAConfig: AgentConfig, agentBConfig: AgentConfig, sessionConfig: SessionConfig, promptModeA: PromptMode, promptModeB: PromptMode, step: ArenaConfigurationStep, isArenaRunning: boolean) {
  return {
    phase: step, isArenaRunning, template: sessionConfig.scenarioType,
    modelA: publicAgentConfiguration(agentAConfig), modelB: publicAgentConfiguration(agentBConfig),
    session: { agentSpeaksFirst: sessionConfig.agentSpeaksFirst, topic: sessionConfig.topic, extraRules: sessionConfig.extraRules, agentForTopic: sessionConfig.agentIsPro },
    systemPrompts: { modelA: { mode: promptModeA, value: agentAConfig.systemPrompt }, modelB: { mode: promptModeB, value: agentBConfig.systemPrompt } },
    customToolsNote: 'Each model’s customTools array replaces its complete custom-tool list when supplied. Every custom tool declares a JSON Schema, immediate result, visibility, and optional terminal outcome.',
  };
}

function validateCustomPrompts(template: ArenaTemplate, modelA: AgentConfig, modelB: AgentConfig, input: Record<string, unknown>) {
  const hasPromptA = hasOwn(input, 'modelASystemPrompt');
  const hasPromptB = hasOwn(input, 'modelBSystemPrompt');
  const promptA = hasPromptA ? requireString(input, 'modelASystemPrompt') : modelA.systemPrompt;
  const promptB = hasPromptB ? requireString(input, 'modelBSystemPrompt') : modelB.systemPrompt;
  if (template === 'custom' && (!promptA.trim() || !promptB.trim())) throw new Error('Custom Arena requires complete system prompts for both models.');
  if (hasPromptA && !promptA.trim()) throw new Error('modelASystemPrompt cannot be empty when supplied.');
  if (hasPromptB && !promptB.trim()) throw new Error('modelBSystemPrompt cannot be empty when supplied.');
  return { hasPromptA, hasPromptB, promptA, promptB };
}

/**
 * Persistent one-command WebMCP control plane for the Arena. The visible,
 * multi-step researcher survey remains unchanged; an agent can configure the
 * exact same state in one atomic call.
 */
export function ArenaConfigurationTools(props: ArenaConfigurationToolsProps) {
  const latestRef = useRef(props);
  latestRef.current = props;
  const hasRegisteredRef = useRef(false);

  useEffect(() => {
    if (hasRegisteredRef.current) return;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const registerTool = () => {
      const modelContext = document.modelContext ?? navigator.modelContext;
      if (!modelContext) {
        if (attempts++ < 50) retryTimer = setTimeout(registerTool, 100);
        return;
      }
      if (hasRegisteredRef.current) return;
      hasRegisteredRef.current = true;

      void modelContext.registerTool({
        name: 'lobasters_arena',
        description: [
          'Control the complete Lobasters Arena through one persistent WebMCP command.',
          'Use action "configure" with one nested configuration payload to select a template and atomically configure Model A, Model B, session settings, both prompts, and every custom tool. Omitted fields preserve live values; each supplied customTools list replaces that model’s complete custom-tool list.',
          'Custom tools support a name, description, JSON Schema arguments, immediate system result, send-to-opponent visibility, and a private/terminal outcome.',
          'API keys are write-only: they may be set but tool discovery and results reveal only configured status.',
          'Use get_configuration before editing. configure opens prompt review; then use start. stop and start_new remain available for the live session lifecycle.',
        ].join('\n\n'),
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: { type: 'string', enum: ['get_configuration', 'configure', 'start', 'stop', 'start_new'], description: 'Arena operation.' },
            configuration: arenaConfigurationSchema,
          },
          required: ['action'],
        },
        execute: async (input: Record<string, unknown>) => {
          const action = requireString(input, 'action');
          const current = latestRef.current;

          if (action === 'get_configuration') {
            return result(publicConfiguration(current.agentAConfig, current.agentBConfig, current.sessionConfig, current.promptModeA, current.promptModeB, current.step, current.isArenaRunning));
          }
          if (action === 'configure') {
            const configuration = optionalObject(input, 'configuration');
            if (!configuration) throw new Error('configuration is required for configure.');
            const requestedTemplate = hasOwn(configuration, 'template')
              ? requireString(configuration, 'template') as ArenaTemplate
              : current.sessionConfig.scenarioType;
            if (!requestedTemplate || !['sales', 'hiring', 'debate', 'custom'].includes(requestedTemplate)) {
              throw new Error('A valid template is required when configuring a new Arena.');
            }

            const templateChanged = requestedTemplate !== current.sessionConfig.scenarioType;
            const base = templateChanged
              ? templateDefaults(requestedTemplate, current.sessionConfig)
              : { modelA: current.agentAConfig, modelB: current.agentBConfig, session: { ...current.sessionConfig, scenarioType: requestedTemplate }, promptModeA: current.promptModeA, promptModeB: current.promptModeB };
            const modelAInput = optionalObject(configuration, 'modelA');
            const modelBInput = optionalObject(configuration, 'modelB');
            let modelA = modelAInput ? applyAgentPatch(base.modelA, modelAInput, 'A') : base.modelA;
            let modelB = modelBInput ? applyAgentPatch(base.modelB, modelBInput, 'B') : base.modelB;
            const session = applySessionPatch(base.session, optionalObject(configuration, 'session'), requestedTemplate);
            const prompts = validateCustomPrompts(requestedTemplate, modelA, modelB, configuration);
            if (prompts.hasPromptA) modelA = { ...modelA, systemPrompt: prompts.promptA };
            if (prompts.hasPromptB) modelB = { ...modelB, systemPrompt: prompts.promptB };
            const promptModeA: PromptMode = prompts.hasPromptA || requestedTemplate === 'custom' ? 'custom' : base.promptModeA;
            const promptModeB: PromptMode = prompts.hasPromptB || requestedTemplate === 'custom' ? 'custom' : base.promptModeB;

            // Keep a follow-up start coherent before React applies batched researcher-form updates.
            latestRef.current = { ...current, step: 'review', agentAConfig: modelA, agentBConfig: modelB, sessionConfig: session, promptModeA, promptModeB };
            current.setAgentAConfig(modelA);
            current.setAgentBConfig(modelB);
            current.setSessionConfig(session);
            current.setPromptModeA(promptModeA);
            current.setPromptModeB(promptModeB);
            current.onOpenReview();
            return result({
              message: 'Entire Arena configuration saved in one command. Opening system-prompt review.',
              ...publicConfiguration(modelA, modelB, session, promptModeA, promptModeB, 'review', false),
            });
          }
          if (action === 'start') {
            if (current.step !== 'review') throw new Error('The Arena must be configured and reviewed before it can start. Use configure first.');
            const template = current.sessionConfig.scenarioType;
            if (!template) throw new Error('Choose an Arena template before starting.');
            if (template === 'custom' && (!current.agentAConfig.systemPrompt.trim() || !current.agentBConfig.systemPrompt.trim())) {
              throw new Error('Custom Arena requires complete system prompts for both models before it can start.');
            }
            await current.onStartArena({
              agentAConfig: current.agentAConfig,
              agentBConfig: current.agentBConfig,
              sessionConfig: current.sessionConfig,
              promptModeA: current.promptModeA,
              promptModeB: current.promptModeB,
            });
            latestRef.current = { ...current, step: 'debate', isArenaRunning: true };
            return result('Arena is starting. Live model output will appear in the Arena session once the configured provider responds.');
          }
          if (action === 'stop') {
            if (!current.isArenaRunning) throw new Error('No live Arena session is running.');
            current.onStopArena();
            return result('Stopping the Arena session and recording it as a draw.');
          }
          if (action === 'start_new') {
            current.onStartNewArena();
            return result('Starting a new Arena. Current session configuration and transcript are cleared.');
          }
          throw new Error('Unsupported Arena action.');
        },
      }, { signal: controller.signal }).catch(() => {
        // Browsers without WebMCP retain the complete researcher-facing Arena.
      });
    };

    // Avoid React development-mode Strict Effects registering a throwaway signal.
    retryTimer = setTimeout(registerTool, 0);
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  return null;
}
