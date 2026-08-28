'use client';

import { useEffect } from 'react';
import type {
  AgentConfig,
  AgentID,
  Depth,
  ReasoningCaptureMethod,
  ScenarioType,
  SpeakingStyle,
  ToolDefinition,
} from '@/app/debate/types';

type ArenaTemplate = Exclude<ScenarioType, null>;
type ArenaConfigurationStep = 'scenario' | 'agents' | 'topic' | 'review' | 'debate';
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
  onSelectTemplate: (template: ArenaTemplate) => void;
};

type CustomToolInput = {
  name: string;
  description: string;
  argumentsSchema: Record<string, unknown>;
  systemResult: string;
  sendToOpponent: boolean;
  termination: ToolTermination;
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

const templateInputSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    template: {
      type: 'string',
      enum: ['sales', 'hiring', 'debate', 'custom'],
      description:
        'sales = Sales Simulation; hiring = Salary Negotiation; debate = Classic Debate; custom = blank custom setup.',
    },
  },
  required: ['template'],
};

const customToolSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: {
      type: 'string',
      description: 'Function name exposed to the arena model.',
    },
    description: {
      type: 'string',
      description: 'What the tool does and when the arena model should call it.',
    },
    argumentsSchema: {
      type: 'object',
      description: 'The tool arguments as a valid JSON Schema object.',
      additionalProperties: true,
    },
    systemResult: {
      type: 'string',
      description: 'Immediate tool result returned by Lobasters when the tool is called.',
    },
    sendToOpponent: {
      type: 'boolean',
      description: 'Whether the call and result are broadcast to the opposing model.',
    },
    termination: {
      type: 'string',
      enum: terminations,
      description:
        'Only used when sendToOpponent is false. Choose private_to_caller for no termination, or select who wins and end the session.',
    },
  },
  required: [
    'name',
    'description',
    'argumentsSchema',
    'systemResult',
    'sendToOpponent',
    'termination',
  ],
};

const agentConfigurationInputSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    nickname: {
      type: 'string',
      description: 'Display nickname for this model in the Arena.',
    },
    modelName: {
      type: 'string',
      description: 'Exact provider model identifier.',
    },
    baseURL: {
      type: 'string',
      description: 'OpenAI-compatible API base URL. Lobasters adds https:// when no protocol is supplied.',
    },
    enableManualTool: {
      type: 'boolean',
      description: 'Enable the private read_manual tool.',
    },
    manualContent: {
      type: 'string',
      description: 'Private manual text. Supply meaningful content whenever the manual tool is enabled.',
    },
    enableGiveUp: {
      type: 'boolean',
      description: 'Enable the built-in giveUp tool, which lets this model concede the session.',
    },
    canThink: {
      type: 'boolean',
      description: 'Whether Lobasters should capture private model reasoning.',
    },
    reasoningCaptureMethod: {
      type: 'string',
      enum: reasoningMethods,
      description:
        'none, tags for XML start/end tags, field for a native API response field, or all for systematic scanning of every supported method.',
    },
    reasoningStartTag: {
      type: 'string',
      description: 'Opening XML reasoning tag when reasoningCaptureMethod is tags.',
    },
    reasoningEndTag: {
      type: 'string',
      description: 'Closing XML reasoning tag when reasoningCaptureMethod is tags.',
    },
    reasoningField: {
      type: 'string',
      description:
        'Native API reasoning field when reasoningCaptureMethod is field, such as reasoning_content, reasoning, thought, or another provider-specific field.',
    },
    speakingStyle: {
      type: 'string',
      enum: speakingStyles,
      description: 'Speaking persona used by the generated Arena prompt.',
    },
    depth: {
      type: 'string',
      enum: depths,
      description: 'Desired response complexity: low, medium, or high.',
    },
    temperature: {
      type: 'number',
      minimum: 0,
      maximum: 2,
      description: 'Provider sampling temperature from 0 through 2.',
    },
    maxChatMessages: {
      oneOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
      description: 'Maximum prior chat messages retained, or null to retain all messages.',
    },
    maxTokens: {
      type: 'integer',
      minimum: 1,
      description: 'Maximum output tokens requested from the provider.',
    },
    customTools: {
      type: 'array',
      items: customToolSchema,
      description:
        'Complete replacement list of custom semantic tools. Omit to preserve every current custom tool; pass [] to remove them all. Built-in manual and give-up tools are controlled separately.',
    },
  },
};

function text(message: string) {
  return { content: [{ type: 'text' as const, text: message }] };
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
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number.`);
  }
  return value;
}

function parseArgumentsSchema(schema?: string): Record<string, unknown> {
  if (!schema) return { type: 'object', properties: {} };
  try {
    const parsed: unknown = JSON.parse(schema);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Keep discovery usable even when a researcher has temporarily entered
    // invalid JSON in the human-facing form.
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
      argumentsSchema: {
        type: 'object',
        properties: { reason: { type: 'string', description: 'Reason for conceding.' } },
        required: ['reason'],
      },
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
    note: 'The API key is intentionally preserved by edits but never exposed to WebMCP.',
  };
}

function createToolId(agentId: AgentID, index: number) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `webmcp-${agentId}-${Date.now()}-${index}`;
}

function readCustomTools(
  value: unknown,
  currentTools: ToolDefinition[],
  agentId: AgentID,
): ToolDefinition[] {
  if (!Array.isArray(value)) throw new Error('customTools must be an array.');

  const seenNames = new Set<string>();
  return value.map((rawTool, index) => {
    if (!rawTool || typeof rawTool !== 'object' || Array.isArray(rawTool)) {
      throw new Error(`customTools[${index}] must be an object.`);
    }
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
    if (!terminations.includes(termination)) {
      throw new Error(`customTools[${index}].termination is not supported.`);
    }

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

function applyAgentPatch(
  current: AgentConfig,
  input: Record<string, unknown>,
  agentId: AgentID,
): AgentConfig {
  const next = { ...current };
  const stringFields = ['nickname', 'modelName', 'manualContent', 'reasoningField'] as const;
  for (const field of stringFields) {
    if (hasOwn(input, field)) next[field] = requireString(input, field);
  }

  if (hasOwn(input, 'baseURL')) {
    const baseURL = requireString(input, 'baseURL');
    next.baseURL = baseURL && !/^https?:\/\//i.test(baseURL) ? `https://${baseURL}` : baseURL;
  }
  if (hasOwn(input, 'enableManualTool')) {
    next.enableManualTool = requireBoolean(input, 'enableManualTool');
  }
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
    if (maxHistory === null) {
      next.maxHistory = undefined;
    } else if (typeof maxHistory === 'number' && Number.isInteger(maxHistory) && maxHistory >= 1) {
      next.maxHistory = maxHistory;
    } else {
      throw new Error('maxChatMessages must be a positive integer or null.');
    }
  }
  if (hasOwn(input, 'maxTokens')) {
    const maxTokens = requireNumber(input, 'maxTokens');
    if (!Number.isInteger(maxTokens) || maxTokens < 1) {
      throw new Error('maxTokens must be a positive integer.');
    }
    next.maxTokens = maxTokens;
  }
  if (hasOwn(input, 'customTools')) {
    next.customTools = readCustomTools(input.customTools, current.customTools, agentId);
  }

  if (next.enableManualTool && !next.manualContent.trim()) {
    throw new Error('manualContent is required when enableManualTool is true.');
  }
  if (next.canThink && next.reasoningCaptureMethod === 'none') {
    throw new Error('Choose tags, field, or all when canThink is true.');
  }
  if (next.canThink && next.reasoningCaptureMethod === 'tags' && (!next.startTag || !next.endTag)) {
    throw new Error('Both reasoningStartTag and reasoningEndTag are required for XML tag capture.');
  }
  if (next.canThink && next.reasoningCaptureMethod === 'field' && !next.reasoningField.trim()) {
    throw new Error('reasoningField is required for native API field capture.');
  }

  return next;
}

function configurationDescription(agentId: AgentID, config: AgentConfig) {
  return [
    `Configure Arena Model ${agentId} in one survey-level call.`,
    'Every property is optional: omitted values are preserved, while customTools replaces the complete custom-tool list only when supplied.',
    'The current live configuration is included below so you can inspect it before editing:',
    JSON.stringify(publicAgentConfiguration(config), null, 2),
  ].join('\n');
}

/**
 * Provides an agent-oriented control surface over the existing Arena forms.
 * Human researchers continue to use the same visible controls and state.
 */
export function ArenaConfigurationTools({
  step,
  agentAConfig,
  setAgentAConfig,
  agentBConfig,
  setAgentBConfig,
  onSelectTemplate,
}: ArenaConfigurationToolsProps) {
  useEffect(() => {
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const registerTools = () => {
      const modelContext = document.modelContext ?? navigator.modelContext;
      if (!modelContext) {
        if (attempts++ < 50) retryTimer = setTimeout(registerTools, 100);
        return;
      }

      const register = (tool: WebMcpTool) => {
        void modelContext.registerTool(tool, { signal: controller.signal }).catch(() => {
          // WebMCP remains progressive enhancement; unsupported browsers do
          // not affect the researcher-facing Arena.
        });
      };

      if (step === 'scenario') {
        register({
          name: 'lobasters_choose_arena_template',
          description:
            'Choose one Arena template and open its two independent model-configuration surveys. Options: Sales Simulation, Salary Negotiation, Classic Debate, or Custom.',
          inputSchema: templateInputSchema,
          execute: input => {
            const template = requireString(input, 'template') as ArenaTemplate;
            if (!['sales', 'hiring', 'debate', 'custom'].includes(template)) {
              throw new Error('Unknown Arena template.');
            }
            onSelectTemplate(template);
            return text(
              `Selected the ${template} Arena template. Model A and Model B configuration tools are now available with their current prefilled values.`,
            );
          },
        });
        return;
      }

      if (step === 'agents') {
        const registerAgent = (
          agentId: AgentID,
          config: AgentConfig,
          setConfig: (next: AgentConfig) => void,
        ) => {
          register({
            name: `lobasters_configure_arena_model_${agentId.toLowerCase()}`,
            description: configurationDescription(agentId, config),
            inputSchema: agentConfigurationInputSchema,
            execute: input => {
              const next = applyAgentPatch(config, input, agentId);
              setConfig(next);
              return text(
                `Arena Model ${agentId} was updated. Current configuration:\n${JSON.stringify(publicAgentConfiguration(next), null, 2)}`,
              );
            },
          });
        };

        registerAgent('A', agentAConfig, setAgentAConfig);
        registerAgent('B', agentBConfig, setAgentBConfig);
      }
    };

    registerTools();

    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    step,
    agentAConfig,
    agentBConfig,
    setAgentAConfig,
    setAgentBConfig,
    onSelectTemplate,
  ]);

  return null;
}
