'use client';

import { useEffect, useRef } from 'react';
import type {
  LLMConnectionConfig,
  LM0AgentConfig,
  LM0Config,
  ReasoningCaptureMethod,
} from '@/app/lm0/types';
import {
  constructSystemPrompt,
  MASTER_AGENT_SYSTEM_PROMPT_TEMPLATE,
  TURN_PROMPT_TEMPLATE,
} from '@/app/lm0/utils';

export type LabSetupStep = 'master-agent' | 'environment' | 'challenges' | 'review';
export type LabPromptMode = 'template' | 'custom';

interface LabSetupToolsProps {
  step: LabSetupStep;
  config: LM0Config;
  promptMode: LabPromptMode;
  applyConfiguration: (config: LM0Config, promptMode: LabPromptMode) => void;
  openReview: () => void;
  startSession: (config: LM0Config, promptMode: LabPromptMode) => Promise<void>;
}

const reasoningMethods: ReasoningCaptureMethod[] = ['none', 'tags', 'field', 'all'];

const agentProperties = {
  modelName: { type: 'string', description: 'Provider model identifier.' },
  baseURL: { type: 'string', description: 'OpenAI-compatible provider base URL.' },
  apiKey: {
    type: 'string',
    description: 'Write-only provider credential. It is accepted but never returned by WebMCP.',
  },
  temperature: { type: 'number', minimum: 0, maximum: 2 },
  canThink: { type: 'boolean' },
  reasoningCaptureMethod: {
    type: 'string',
    enum: reasoningMethods,
    description: 'Use none, XML tags, one native response field, or systematic scanning of all supported methods.',
  },
  reasoningField: { type: 'string', description: 'Native API reasoning field used by field or all capture.' },
  reasoningStartTag: { type: 'string', description: 'Opening XML reasoning tag used by tags or all capture.' },
  reasoningEndTag: { type: 'string', description: 'Closing XML reasoning tag used by tags or all capture.' },
  maxChatHistory: {
    oneOf: [
      { type: 'integer', minimum: 1 },
      { type: 'null' },
    ],
    description: 'Maximum retained messages, or null to keep all messages.',
  },
} as const;

const masterAgentSchema = {
  type: 'object',
  additionalProperties: false,
  description: 'Master orchestrator fields. Omitted properties preserve their live values.',
  properties: agentProperties,
} as const;

const helperAgentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      description: 'Stable helper identifier. Omit only for a new helper; Lobasters then assigns llm-N.',
    },
    nickname: { type: 'string' },
    ...agentProperties,
    maxTokens: { type: 'integer', minimum: 1 },
    systemPrompt: { type: 'string', description: 'Complete helper-agent system prompt.' },
  },
  required: ['nickname', 'modelName', 'baseURL'],
} as const;

const configurationSchema = {
  type: 'object',
  additionalProperties: false,
  description: 'One atomic LAB setup payload. Omit a section to preserve it, except helperAgents replaces the whole list when supplied.',
  properties: {
    masterAgent: masterAgentSchema,
    environment: {
      type: 'object',
      additionalProperties: false,
      properties: {
        questionSource: { type: 'string', enum: ['agent', 'user'] },
        questionBankContent: {
          type: 'string',
          description: 'Complete question-bank.md content when questionSource is user.',
        },
        allowHelperAgents: { type: 'boolean' },
      },
    },
    helperAgents: {
      type: 'array',
      description: 'Complete replacement helper list. Reuse a returned id and omit apiKey to retain its write-only credential.',
      items: helperAgentSchema,
    },
    challengePlan: {
      type: 'object',
      additionalProperties: false,
      properties: {
        challengeCount: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
    filesystem: {
      type: 'object',
      additionalProperties: false,
      properties: {
        allowedFiles: {
          type: 'array',
          minItems: 2,
          maxItems: 6,
          uniqueItems: true,
          items: { type: 'string', pattern: '^[a-zA-Z0-9_.-]+\\.md$' },
          description: 'Complete virtual markdown filename list (2-6 files).',
        },
        manualContent: {
          type: 'string',
          description: 'Complete manual.md content. Used only when manual.md is allowed.',
        },
      },
    },
    prompts: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: {
          type: 'string',
          enum: ['template', 'custom'],
          description: 'Template generates the LAB master prompt; custom uses masterSystemPrompt exactly.',
        },
        masterSystemPrompt: {
          type: 'string',
          description: 'Complete custom Master Agent prompt. It is used exactly when mode is custom.',
        },
        systemPromptTemplate: {
          type: 'string',
          description: 'Advanced custom master template/fallback supporting LAB placeholders.',
        },
        turnPromptTemplate: {
          type: 'string',
          description: 'Complete per-turn prompt template used in custom mode.',
        },
      },
    },
  },
} as const;

function result(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text' as const, text }] };
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
  if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean.`);
  return value;
}

function requireNumber(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number.`);
  }
  return value;
}

function optionalObject(input: Record<string, unknown>, key: string) {
  if (!hasOwn(input, key)) return undefined;
  const value = input[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${key} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function normalizedBaseURL(value: string) {
  const trimmed = value.trim();
  return trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
}

function patchAgent<T extends LM0AgentConfig>(current: T, input: Record<string, unknown>): T {
  const next = { ...current };

  if (hasOwn(input, 'modelName')) next.modelName = requireString(input, 'modelName').trim();
  if (hasOwn(input, 'baseURL')) next.baseURL = normalizedBaseURL(requireString(input, 'baseURL'));
  if (hasOwn(input, 'apiKey')) next.apiKey = requireString(input, 'apiKey');
  if (hasOwn(input, 'temperature')) {
    const temperature = requireNumber(input, 'temperature');
    if (temperature < 0 || temperature > 2) throw new Error('temperature must be between 0 and 2.');
    next.temperature = temperature;
  }
  if (hasOwn(input, 'canThink')) next.canThink = requireBoolean(input, 'canThink');
  if (hasOwn(input, 'reasoningCaptureMethod')) {
    const method = requireString(input, 'reasoningCaptureMethod') as ReasoningCaptureMethod;
    if (!reasoningMethods.includes(method)) throw new Error('reasoningCaptureMethod is not supported.');
    next.reasoningCaptureMethod = method;
  }
  if (hasOwn(input, 'reasoningField')) next.reasoningField = requireString(input, 'reasoningField');
  if (hasOwn(input, 'reasoningStartTag')) next.startTag = requireString(input, 'reasoningStartTag');
  if (hasOwn(input, 'reasoningEndTag')) next.endTag = requireString(input, 'reasoningEndTag');
  if (hasOwn(input, 'maxChatHistory')) {
    const maxHistory = input.maxChatHistory;
    if (maxHistory === null) next.maxHistory = undefined;
    else if (typeof maxHistory === 'number' && Number.isInteger(maxHistory) && maxHistory >= 1) {
      next.maxHistory = maxHistory;
    } else {
      throw new Error('maxChatHistory must be a positive integer or null.');
    }
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

function emptyHelper(id: string): LLMConnectionConfig {
  return {
    id,
    nickname: '',
    modelName: '',
    baseURL: '',
    apiKey: '',
    temperature: 0.7,
    maxTokens: 4096,
    systemPrompt: 'You are a helpful assistant. Respond directly to the user\'s request.',
    canThink: false,
    reasoningCaptureMethod: 'none',
    reasoningField: 'reasoning_content',
    startTag: '<thinking>',
    endTag: '</thinking>',
    maxHistory: undefined,
  };
}

function replaceHelperAgents(current: LLMConnectionConfig[], value: unknown) {
  if (!Array.isArray(value)) throw new Error('helperAgents must be an array.');

  const replacements = value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`helperAgents[${index}] must be an object.`);
    }
    const input = item as Record<string, unknown>;
    const id = hasOwn(input, 'id') ? requireString(input, 'id').trim() : `llm-${index + 1}`;
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error(`helperAgents[${index}].id must contain only letters, numbers, dashes, or underscores.`);
    }
    for (const required of ['nickname', 'modelName', 'baseURL']) {
      if (!hasOwn(input, required)) throw new Error(`helperAgents[${index}].${required} is required.`);
    }

    const existing = current.find((helper) => helper.id === id) ?? emptyHelper(id);
    const patched = patchAgent(existing, input);
    patched.id = id;
    patched.nickname = requireString(input, 'nickname').trim();
    patched.systemPrompt = hasOwn(input, 'systemPrompt')
      ? requireString(input, 'systemPrompt')
      : existing.systemPrompt;
    if (hasOwn(input, 'maxTokens')) {
      const maxTokens = requireNumber(input, 'maxTokens');
      if (!Number.isInteger(maxTokens) || maxTokens < 1) {
        throw new Error(`helperAgents[${index}].maxTokens must be a positive integer.`);
      }
      patched.maxTokens = maxTokens;
    }
    return patched;
  });

  const ids = replacements.map((helper) => helper.id);
  if (new Set(ids).size !== ids.length) throw new Error('helperAgents ids must be unique.');
  return replacements;
}

function parseAllowedFiles(value: unknown) {
  if (!Array.isArray(value) || value.some((file) => typeof file !== 'string')) {
    throw new Error('allowedFiles must be an array of markdown filenames.');
  }
  const files = value.map((file) => file.trim());
  if (files.length < 2 || files.length > 6) throw new Error('allowedFiles must contain 2 through 6 files.');
  if (new Set(files).size !== files.length) throw new Error('allowedFiles cannot contain duplicates.');
  if (files.some((file) => !/^[a-zA-Z0-9_.-]+\.md$/.test(file))) {
    throw new Error('Every allowed file must be a valid .md filename.');
  }
  return files;
}

function buildCandidate(current: LM0Config, input: Record<string, unknown>) {
  let next: LM0Config = {
    ...current,
    masterAgent: { ...current.masterAgent },
    llmConnections: current.llmConnections.map((helper) => ({ ...helper })),
    allowedFiles: [...current.allowedFiles],
  };

  const masterAgent = optionalObject(input, 'masterAgent');
  if (masterAgent) next.masterAgent = patchAgent(next.masterAgent, masterAgent);

  const environment = optionalObject(input, 'environment');
  if (environment) {
    if (hasOwn(environment, 'questionSource')) {
      const source = requireString(environment, 'questionSource');
      if (source !== 'agent' && source !== 'user') throw new Error('questionSource must be agent or user.');
      next.questionSource = source;
    }
    if (hasOwn(environment, 'questionBankContent')) {
      next.questionBankContent = requireString(environment, 'questionBankContent');
    }
    if (hasOwn(environment, 'allowHelperAgents')) {
      next.allowHelperAgents = requireBoolean(environment, 'allowHelperAgents');
    }
  }

  if (hasOwn(input, 'helperAgents')) {
    next.llmConnections = replaceHelperAgents(current.llmConnections, input.helperAgents);
  }

  const challengePlan = optionalObject(input, 'challengePlan');
  if (challengePlan && hasOwn(challengePlan, 'challengeCount')) {
    const challengeCount = requireNumber(challengePlan, 'challengeCount');
    if (!Number.isInteger(challengeCount) || challengeCount < 1 || challengeCount > 100) {
      throw new Error('challengeCount must be an integer from 1 through 100.');
    }
    next.challengeCount = challengeCount;
  }

  const filesystem = optionalObject(input, 'filesystem');
  if (filesystem) {
    if (hasOwn(filesystem, 'allowedFiles')) next.allowedFiles = parseAllowedFiles(filesystem.allowedFiles);
    if (hasOwn(filesystem, 'manualContent')) next.manualContent = requireString(filesystem, 'manualContent');
  }

  const prompts = optionalObject(input, 'prompts');
  if (prompts) {
    if (hasOwn(prompts, 'mode')) {
      const mode = requireString(prompts, 'mode');
      if (mode !== 'template' && mode !== 'custom') throw new Error('prompts.mode must be template or custom.');
      next.useCustomPrompts = mode === 'custom';
    }
    if (hasOwn(prompts, 'masterSystemPrompt')) {
      next.masterAgent.systemPrompt = requireString(prompts, 'masterSystemPrompt');
    }
    if (hasOwn(prompts, 'systemPromptTemplate')) {
      next.systemPromptTemplate = requireString(prompts, 'systemPromptTemplate');
    }
    if (hasOwn(prompts, 'turnPromptTemplate')) {
      next.turnPromptTemplate = requireString(prompts, 'turnPromptTemplate');
    }
  }

  if (next.questionSource === 'agent') next.questionBankContent = '';
  if (!next.allowedFiles.includes('manual.md')) next.manualContent = '';
  return next;
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function agentReadinessErrors(agent: LM0AgentConfig, label: string) {
  const errors: string[] = [];
  if (!agent.modelName.trim()) errors.push(`${label} modelName is required.`);
  if (!agent.baseURL.trim()) errors.push(`${label} baseURL is required.`);
  else if (!validHttpUrl(agent.baseURL)) errors.push(`${label} baseURL must be an HTTP or HTTPS URL.`);
  if (!agent.apiKey) errors.push(`${label} apiKey is not configured.`);
  if (!Number.isFinite(agent.temperature) || agent.temperature < 0 || agent.temperature > 2) {
    errors.push(`${label} temperature must be between 0 and 2.`);
  }
  if (agent.maxHistory !== undefined && (!Number.isInteger(agent.maxHistory) || agent.maxHistory < 1)) {
    errors.push(`${label} maxChatHistory must be a positive integer or null.`);
  }
  if (!reasoningMethods.includes(agent.reasoningCaptureMethod)) {
    errors.push(`${label} reasoningCaptureMethod is not supported.`);
  }
  if (agent.canThink && agent.reasoningCaptureMethod === 'none') {
    errors.push(`${label} needs a reasoning capture method when canThink is true.`);
  }
  if (agent.canThink && agent.reasoningCaptureMethod === 'tags' && (!agent.startTag || !agent.endTag)) {
    errors.push(`${label} needs both reasoning XML tags.`);
  }
  if (agent.canThink && agent.reasoningCaptureMethod === 'field' && !agent.reasoningField.trim()) {
    errors.push(`${label} needs a native reasoning field.`);
  }
  return errors;
}

function validateConfiguration(config: LM0Config) {
  const errors = agentReadinessErrors(config.masterAgent, 'Master Agent');
  if (!Number.isInteger(config.challengeCount) || config.challengeCount < 1 || config.challengeCount > 100) {
    errors.push('challengeCount must be an integer from 1 through 100.');
  }
  if (config.allowedFiles.length < 2 || config.allowedFiles.length > 6) {
    errors.push('The virtual filesystem must contain 2 through 6 files.');
  }
  if (new Set(config.allowedFiles).size !== config.allowedFiles.length) {
    errors.push('Virtual filenames must be unique.');
  }
  if (config.allowedFiles.some((file) => !/^[a-zA-Z0-9_.-]+\.md$/.test(file))) {
    errors.push('Every virtual file must have a valid .md filename.');
  }
  if (config.questionSource === 'user' && !config.questionBankContent.trim()) {
    errors.push('questionBankContent is required when the researcher supplies questions.');
  }
  if (config.allowHelperAgents) {
    const ids = config.llmConnections.map((helper) => helper.id);
    if (new Set(ids).size !== ids.length) errors.push('Helper Agent ids must be unique.');
    config.llmConnections.forEach((helper, index) => {
      const label = `Helper Agent ${index + 1} (${helper.id})`;
      if (!helper.nickname.trim()) errors.push(`${label} nickname is required.`);
      errors.push(...agentReadinessErrors(helper, label));
      if (!Number.isInteger(helper.maxTokens) || (helper.maxTokens ?? 0) < 1) {
        errors.push(`${label} maxTokens must be a positive integer.`);
      }
    });
  }
  return errors;
}

function publicAgent(agent: LM0AgentConfig) {
  return {
    modelName: agent.modelName,
    baseURL: agent.baseURL,
    temperature: agent.temperature,
    canThink: agent.canThink,
    reasoningCaptureMethod: agent.reasoningCaptureMethod,
    reasoningField: agent.reasoningField,
    reasoningStartTag: agent.startTag,
    reasoningEndTag: agent.endTag,
    maxChatHistory: agent.maxHistory ?? null,
    apiKeyStatus: agent.apiKey ? 'configured (write-only)' : 'not configured',
  };
}

function scrubConfiguredSecrets<T>(value: T, config: LM0Config): T {
  const secrets = [config.masterAgent.apiKey, ...config.llmConnections.map(helper => helper.apiKey)]
    .filter((secret): secret is string => Boolean(secret))
    .sort((left, right) => right.length - left.length);
  const clean = (current: unknown): unknown => {
    if (typeof current === 'string') {
      return secrets.reduce((text, secret) => text.split(secret).join('[REDACTED]'), current);
    }
    if (Array.isArray(current)) return current.map(clean);
    if (current && typeof current === 'object') {
      return Object.fromEntries(
        Object.entries(current as Record<string, unknown>).map(([key, entry]) => [key, clean(entry)]),
      );
    }
    return current;
  };
  return clean(value) as T;
}

function publicConfiguration(config: LM0Config, step: LabSetupStep) {
  const errors = validateConfiguration(config);
  return scrubConfiguredSecrets({
    phase: step,
    readyToStart: errors.length === 0,
    validationErrors: errors,
    configuration: {
      masterAgent: publicAgent(config.masterAgent),
      environment: {
        questionSource: config.questionSource,
        questionBankContent: config.questionBankContent,
        allowHelperAgents: config.allowHelperAgents,
      },
      helperAgents: config.llmConnections.map((helper) => ({
        id: helper.id,
        nickname: helper.nickname,
        ...publicAgent(helper),
        maxTokens: helper.maxTokens ?? 4096,
        systemPrompt: helper.systemPrompt,
      })),
      challengePlan: { challengeCount: config.challengeCount },
      filesystem: {
        allowedFiles: config.allowedFiles,
        manualContent: config.manualContent,
      },
      prompts: {
        mode: config.useCustomPrompts ? 'custom' : 'template',
        masterSystemPrompt: config.masterAgent.systemPrompt,
        systemPromptTemplate: config.systemPromptTemplate,
        turnPromptTemplate: config.turnPromptTemplate,
      },
    },
    security: 'All API keys are write-only. Only configured/not-configured status is exposed.',
  }, config);
}

function promptPreview(config: LM0Config) {
  return scrubConfiguredSecrets({
    mode: config.useCustomPrompts ? 'custom' : 'template',
    masterSystemPrompt: constructSystemPrompt(config),
    helperSystemPrompts: config.llmConnections.map((helper) => ({
      id: helper.id,
      nickname: helper.nickname,
      systemPrompt: helper.systemPrompt,
    })),
    turnPromptTemplate: config.useCustomPrompts
      ? config.turnPromptTemplate || TURN_PROMPT_TEMPLATE
      : TURN_PROMPT_TEMPLATE,
    builtInMasterTemplate: config.useCustomPrompts ? undefined : MASTER_AGENT_SYSTEM_PROMPT_TEMPLATE,
    note: 'Runtime turn placeholders are resolved from live LAB state on every turn.',
  }, config);
}

/** Persistent one-command WebMCP control plane for the LAB setup route. */
export function LabSetupTools(props: LabSetupToolsProps) {
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
        name: 'lobasters_lab',
        description: [
          'Control Lobasters LAB setup through one persistent WebMCP command.',
          'Use configure with one nested configuration payload to atomically configure the Master Agent, environment, complete helper list, challenge plan, virtual filesystem, and prompts. Omitted sections preserve live values; supplying helperAgents replaces that list.',
          'API keys are write-only: they may be set, but discovery and tool results expose only their configured status.',
          'Use get_configuration before editing, validate_configuration before launch, preview_prompts to inspect the effective instructions, and start only after the configuration is ready.',
        ].join('\n\n'),
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: {
              type: 'string',
              enum: ['get_configuration', 'configure', 'validate_configuration', 'preview_prompts', 'start'],
              description: 'LAB setup operation.',
            },
            configuration: configurationSchema,
          },
          required: ['action'],
        },
        execute: async (input: Record<string, unknown>) => {
          const action = requireString(input, 'action');
          const current = latestRef.current;

          if (action === 'get_configuration') {
            return result(publicConfiguration(current.config, current.step));
          }

          if (action === 'configure') {
            const configuration = optionalObject(input, 'configuration');
            if (!configuration) throw new Error('configuration is required for configure.');
            const next = buildCandidate(current.config, configuration);
            const mode: LabPromptMode = next.useCustomPrompts ? 'custom' : 'template';

            // Keep consecutive WebMCP calls coherent even before React finishes
            // rendering the batched researcher-form updates.
            latestRef.current = { ...current, config: next, promptMode: mode, step: 'review' };
            current.applyConfiguration(next, mode);
            current.openReview();
            return result({
              message: 'LAB configuration applied atomically. Helper agents were replaced only if helperAgents was supplied. Opening review.',
              ...publicConfiguration(next, 'review'),
            });
          }

          if (action === 'validate_configuration') {
            const errors = validateConfiguration(current.config);
            return result({
              valid: errors.length === 0,
              errors,
              phase: current.step,
            });
          }

          if (action === 'preview_prompts') {
            return result(promptPreview(current.config));
          }

          if (action === 'start') {
            if (current.step !== 'review') {
              throw new Error('Review the LAB configuration first. Use configure to atomically fill the setup and open review.');
            }
            const errors = validateConfiguration(current.config);
            if (errors.length) {
              throw new Error(`LAB configuration is not ready:\n- ${errors.join('\n- ')}`);
            }
            await current.startSession(current.config, current.promptMode);
            return result('LAB session is starting with the validated live configuration. Provider requests will begin on the session page.');
          }

          throw new Error('Unsupported LAB setup action.');
        },
      }, { signal: controller.signal }).catch(() => {
        // Browsers without WebMCP retain the complete researcher-facing setup.
      });
    };

    // Defer one task so React's development-only Strict Effects cleanup can
    // cancel the throwaway setup before it registers an already-dead signal.
    retryTimer = setTimeout(registerTool, 0);
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  return null;
}
