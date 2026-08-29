'use client';

import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  GradingScale,
  ProvingGroundAgentConfig,
  ProvingGroundConfig,
  ProvingGroundState,
  ReasoningCaptureMethod,
} from '@/app/proving-ground/types';

type ExamStep = 'models' | 'exam-params' | 'review' | 'running' | 'report';
type PromptMode = 'template' | 'custom';
type ReportFormat = 'pdf' | 'markdown';

interface ExaminationConfigurationToolsProps {
  step: ExamStep;
  teacherConfig: ProvingGroundAgentConfig;
  setTeacherConfig: Dispatch<SetStateAction<ProvingGroundAgentConfig>>;
  studentConfig: ProvingGroundAgentConfig;
  setStudentConfig: Dispatch<SetStateAction<ProvingGroundAgentConfig>>;
  examConfig: Omit<ProvingGroundConfig, 'teacher' | 'student'>;
  setExamConfig: Dispatch<SetStateAction<Omit<ProvingGroundConfig, 'teacher' | 'student'>>>;
  promptModeTeacher: PromptMode;
  setPromptModeTeacher: Dispatch<SetStateAction<PromptMode>>;
  promptModeStudent: PromptMode;
  setPromptModeStudent: Dispatch<SetStateAction<PromptMode>>;
  state: ProvingGroundState;
  onContinueToReview: () => void;
  onStart: () => Promise<void>;
  onReset: () => void;
  onDownloadReport: (format: ReportFormat) => void;
}

const noInputSchema = { type: 'object' as const, properties: {}, additionalProperties: false };
const reasoningMethods = ['none', 'tags', 'field', 'all'] as const;
const gradingScales = ['SABF', 'ABF', 'AF', 'SAF'] as const;

const agentInputSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    nickname: { type: 'string', description: 'Display nickname for this examination model.' },
    modelName: { type: 'string', description: 'Exact provider model identifier.' },
    baseURL: {
      type: 'string',
      description: 'OpenAI-compatible API base URL. Lobasters adds https:// when no protocol is supplied.',
    },
    apiKey: {
      type: 'string',
      description: 'Provider API key to save. This is write-only: it is never returned in WebMCP discovery or results.',
    },
    canThink: { type: 'boolean', description: 'Whether Lobasters should capture private model reasoning.' },
    reasoningCaptureMethod: {
      type: 'string',
      enum: reasoningMethods,
      description: 'none, tags for XML tags, field for a native response field, or all for systematic scanning.',
    },
    reasoningStartTag: { type: 'string', description: 'Opening XML reasoning tag when using tags.' },
    reasoningEndTag: { type: 'string', description: 'Closing XML reasoning tag when using tags.' },
    reasoningField: {
      type: 'string',
      description: 'Native reasoning field, e.g. reasoning_content, reasoning, thought, or another provider field.',
    },
    temperature: { type: 'number', minimum: 0, maximum: 2, description: 'Provider sampling temperature from 0 through 2.' },
    maxTokens: { type: 'integer', minimum: 1, description: 'Maximum output tokens requested from the provider.' },
    maxChatHistory: {
      oneOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
      description: 'Maximum earlier messages to retain, or null for all available history.',
    },
  },
};

const sessionInputSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    gradingScale: {
      type: 'string',
      enum: gradingScales,
      description: 'Allowed grades: SABF, ABF, AF, or SAF.',
    },
    questionCount: { type: 'integer', minimum: 1, maximum: 50, description: 'Number of teacher questions, from 1 through 50.' },
    domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional knowledge domains for the teacher. Pass [] for no domain restriction.',
    },
  },
};

const completeExaminationInputSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    teacher: {
      ...agentInputSchema,
      description: 'Complete or partial Teacher configuration. Omit individual properties to preserve them.',
    },
    student: {
      ...agentInputSchema,
      description: 'Complete or partial Student configuration. Omit individual properties to preserve them.',
    },
    session: {
      ...sessionInputSchema,
      description: 'Examination grading scale, question count, and domains. Omit individual properties to preserve them.',
    },
    teacherSystemPrompt: {
      type: 'string',
      description: 'Optional complete replacement for the Teacher system prompt. Supplying it switches the Teacher to custom-prompt mode.',
    },
    studentSystemPrompt: {
      type: 'string',
      description: 'Optional complete replacement for the Student system prompt. Supplying it switches the Student to custom-prompt mode.',
    },
  },
};

const promptInputSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    teacherSystemPrompt: {
      type: 'string',
      description: 'Complete replacement for the Teacher prompt. Omit to keep its current template or custom prompt unchanged.',
    },
    studentSystemPrompt: {
      type: 'string',
      description: 'Complete replacement for the Student prompt. Omit to keep its current template or custom prompt unchanged.',
    },
  },
};

function result(message: string) {
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

function publicAgentConfiguration(config: ProvingGroundAgentConfig) {
  return {
    nickname: config.nickname,
    modelName: config.modelName,
    baseURL: config.baseURL,
    canThink: config.canThink,
    reasoningCaptureMethod: config.reasoningCaptureMethod,
    reasoningStartTag: config.startTag,
    reasoningEndTag: config.endTag,
    reasoningField: config.reasoningField,
    temperature: config.temperature,
    maxTokens: config.maxTokens ?? 4096,
    maxChatHistory: config.maxHistory ?? null,
    apiKeyStatus: config.apiKey ? 'configured (write-only)' : 'not configured',
    note: 'The API key is write-only. Lobasters never exposes its value through WebMCP.',
  };
}

function patchAgent(current: ProvingGroundAgentConfig, input: Record<string, unknown>) {
  const next = { ...current };
  for (const field of ['nickname', 'modelName', 'reasoningField'] as const) {
    if (hasOwn(input, field)) next[field] = requireString(input, field);
  }
  if (hasOwn(input, 'baseURL')) {
    const baseURL = requireString(input, 'baseURL');
    next.baseURL = baseURL && !/^https?:\/\//i.test(baseURL) ? `https://${baseURL}` : baseURL;
  }
  if (hasOwn(input, 'apiKey')) next.apiKey = requireString(input, 'apiKey');
  if (hasOwn(input, 'canThink')) next.canThink = requireBoolean(input, 'canThink');
  if (hasOwn(input, 'reasoningCaptureMethod')) {
    const method = requireString(input, 'reasoningCaptureMethod') as ReasoningCaptureMethod;
    if (!reasoningMethods.includes(method)) throw new Error('reasoningCaptureMethod is not supported.');
    next.reasoningCaptureMethod = method;
  }
  if (hasOwn(input, 'reasoningStartTag')) next.startTag = requireString(input, 'reasoningStartTag');
  if (hasOwn(input, 'reasoningEndTag')) next.endTag = requireString(input, 'reasoningEndTag');
  if (hasOwn(input, 'temperature')) {
    const temperature = requireNumber(input, 'temperature');
    if (temperature < 0 || temperature > 2) throw new Error('temperature must be between 0 and 2.');
    next.temperature = temperature;
  }
  if (hasOwn(input, 'maxTokens')) {
    const maxTokens = requireNumber(input, 'maxTokens');
    if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new Error('maxTokens must be a positive integer.');
    next.maxTokens = maxTokens;
  }
  if (hasOwn(input, 'maxChatHistory')) {
    const maxHistory = input.maxChatHistory;
    if (maxHistory === null) next.maxHistory = undefined;
    else if (typeof maxHistory === 'number' && Number.isInteger(maxHistory) && maxHistory >= 1) next.maxHistory = maxHistory;
    else throw new Error('maxChatHistory must be a positive integer or null.');
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

function patchSession(
  current: Omit<ProvingGroundConfig, 'teacher' | 'student'>,
  input: Record<string, unknown>,
) {
  const next = { ...current };
  if (hasOwn(input, 'gradingScale')) {
    const gradingScale = requireString(input, 'gradingScale') as GradingScale;
    if (!gradingScales.includes(gradingScale)) throw new Error('gradingScale is not supported.');
    next.gradingScale = gradingScale;
  }
  if (hasOwn(input, 'questionCount')) {
    const questionCount = requireNumber(input, 'questionCount');
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 50) {
      throw new Error('questionCount must be an integer from 1 through 50.');
    }
    next.questionCount = questionCount;
  }
  if (hasOwn(input, 'domains')) {
    if (!Array.isArray(input.domains) || input.domains.some((domain: unknown) => typeof domain !== 'string')) {
      throw new Error('domains must be an array of strings.');
    }
    next.domains = input.domains.map((domain: string) => domain.trim()).filter(Boolean);
  }
  return next;
}

function completeExaminationDescription(
  teacher: ProvingGroundAgentConfig,
  student: ProvingGroundAgentConfig,
  session: Omit<ProvingGroundConfig, 'teacher' | 'student'>,
  teacherPromptMode: PromptMode,
  studentPromptMode: PromptMode,
) {
  return [
    'Configure the entire Examination in ONE WebMCP command. This is the primary agent-oriented setup tool.',
    'It can set both models, the grading scale, question count, domains, and either complete system prompt. Omit a property to preserve its current value.',
    'API keys are write-only: they can be supplied but are never exposed in discovery or results.',
    'Current Teacher configuration:',
    JSON.stringify(publicAgentConfiguration(teacher), null, 2),
    'Current Student configuration:',
    JSON.stringify(publicAgentConfiguration(student), null, 2),
    'Current session configuration:',
    JSON.stringify(session, null, 2),
    `Current Teacher prompt (${teacherPromptMode} mode):\n${teacher.systemPrompt}`,
    `Current Student prompt (${studentPromptMode} mode):\n${student.systemPrompt}`,
  ].join('\n\n');
}

function sanitizedTranscript(transcript: NonNullable<ProvingGroundState['transcript']>) {
  const copy = JSON.parse(JSON.stringify(transcript)) as Record<string, any>;
  if (copy.config?.teacher) delete copy.config.teacher.apiKey;
  if (copy.config?.student) delete copy.config.student.apiKey;
  return copy;
}

/** WebMCP layer over the existing researcher-facing Examination workflow. */
export function ExaminationConfigurationTools({
  step,
  teacherConfig,
  setTeacherConfig,
  studentConfig,
  setStudentConfig,
  examConfig,
  setExamConfig,
  promptModeTeacher,
  setPromptModeTeacher,
  promptModeStudent,
  setPromptModeStudent,
  state,
  onContinueToReview,
  onStart,
  onReset,
  onDownloadReport,
}: ExaminationConfigurationToolsProps) {
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
          // Unsupported browsers retain the normal researcher-facing workflow.
        });
      };

      if (state.status === 'running') {
        register({
          name: 'lobasters_get_examination_status',
          description: 'Read the current live Examination phase and progress. Available while the examination is running.',
          inputSchema: noInputSchema,
          execute: () => result(JSON.stringify({
            status: state.status,
            phase: state.currentPhase,
            completedTurns: state.transcript?.turns.length ?? 0,
            questionCount: state.config?.questionCount ?? null,
            activity: state.activityMessage,
          }, null, 2)),
        });
        return;
      }

      if (state.status === 'finished' || state.status === 'error') {
        if (state.transcript) {
          register({
            name: 'lobasters_get_raw_examination_transcript',
            description: 'Return the complete raw Examination transcript, including requests and responses for every captured turn. API keys are removed.',
            inputSchema: noInputSchema,
            execute: () => result(JSON.stringify(sanitizedTranscript(state.transcript!), null, 2)),
          });
          register({
            name: 'lobasters_copy_raw_examination_transcript',
            description:
              'Copy the complete API-key-sanitized raw Examination transcript to the system clipboard. This is a direct WebMCP action and does not use the researcher-facing button.',
            inputSchema: noInputSchema,
            execute: async () => {
              const rawTranscript = JSON.stringify(sanitizedTranscript(state.transcript!), null, 2);
              try {
                await navigator.clipboard.writeText(rawTranscript);
              } catch {
                throw new Error('The browser denied clipboard access. Allow clipboard access and try again.');
              }
              return result('The sanitized raw Examination transcript was copied to the system clipboard.');
            },
          });
        }
        if (state.status === 'finished' && state.transcript) {
          register({
            name: 'lobasters_download_examination_report',
            description: 'Download the completed Examination report to the local device as a PDF or Markdown file.',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: { format: { type: 'string', enum: ['pdf', 'markdown'] } },
              required: ['format'],
            },
            execute: input => {
              const format = requireString(input, 'format') as ReportFormat;
              if (format !== 'pdf' && format !== 'markdown') throw new Error('format must be pdf or markdown.');
              onDownloadReport(format);
              return result(`Downloading the completed Examination report as ${format === 'pdf' ? 'PDF' : 'Markdown'}.`);
            },
          });
        }
        register({
          name: 'lobasters_run_another_examination',
          description: 'Clear the current Examination session and return to the Teacher and Student configuration surveys.',
          inputSchema: noInputSchema,
          execute: () => {
            onReset();
            return result('Starting a new Examination. Returning to model configuration.');
          },
        });
        return;
      }

      if (step === 'models') {
        register({
          name: 'lobasters_configure_examination',
          description: completeExaminationDescription(
            teacherConfig,
            studentConfig,
            examConfig,
            promptModeTeacher,
            promptModeStudent,
          ),
          inputSchema: completeExaminationInputSchema,
          execute: (input: Record<string, unknown>) => {
            const teacherInput = optionalObject(input, 'teacher');
            const studentInput = optionalObject(input, 'student');
            const sessionInput = optionalObject(input, 'session');
            const nextTeacher = teacherInput ? patchAgent(teacherConfig, teacherInput) : teacherConfig;
            const nextStudent = studentInput ? patchAgent(studentConfig, studentInput) : studentConfig;
            const nextSession = sessionInput ? patchSession(examConfig, sessionInput) : examConfig;

            const teacherPrompt = hasOwn(input, 'teacherSystemPrompt')
              ? requireString(input, 'teacherSystemPrompt')
              : undefined;
            const studentPrompt = hasOwn(input, 'studentSystemPrompt')
              ? requireString(input, 'studentSystemPrompt')
              : undefined;
            if (teacherPrompt !== undefined && !teacherPrompt.trim()) {
              throw new Error('teacherSystemPrompt cannot be empty when supplied.');
            }
            if (studentPrompt !== undefined && !studentPrompt.trim()) {
              throw new Error('studentSystemPrompt cannot be empty when supplied.');
            }

            setTeacherConfig(teacherPrompt === undefined
              ? nextTeacher
              : { ...nextTeacher, systemPrompt: teacherPrompt });
            setStudentConfig(studentPrompt === undefined
              ? nextStudent
              : { ...nextStudent, systemPrompt: studentPrompt });
            setExamConfig(nextSession);
            if (teacherPrompt !== undefined) setPromptModeTeacher('custom');
            if (studentPrompt !== undefined) setPromptModeStudent('custom');
            onContinueToReview();

            return result(JSON.stringify({
              message: 'Entire Examination configuration saved in one command. Opening system-prompt review.',
              teacher: publicAgentConfiguration(nextTeacher),
              student: publicAgentConfiguration(nextStudent),
              session: nextSession,
              teacherPromptMode: teacherPrompt === undefined ? promptModeTeacher : 'custom',
              studentPromptMode: studentPrompt === undefined ? promptModeStudent : 'custom',
            }, null, 2));
          },
        });
        return;
      }

      if (step === 'exam-params') {
        register({
          name: 'lobasters_configure_examination_session',
          description: [
            'Complete the Examination session survey in one call, then continue to system-prompt review.',
            'Omitted values remain unchanged.',
            JSON.stringify(examConfig, null, 2),
          ].join('\n'),
          inputSchema: sessionInputSchema,
          execute: (input: Record<string, unknown>) => {
            const next = patchSession(examConfig, input);
            setExamConfig(next);
            onContinueToReview();
            return result(`Examination parameters saved. Current session:\n${JSON.stringify(next, null, 2)}`);
          },
        });
        return;
      }

      if (step === 'review') {
        register({
          name: 'lobasters_finalize_examination_system_prompts',
          description: [
            'Optionally replace either complete Examination system prompt. Omit a prompt to keep it exactly as written.',
            `Current Teacher prompt (${promptModeTeacher} mode):\n${teacherConfig.systemPrompt}`,
            `Current Student prompt (${promptModeStudent} mode):\n${studentConfig.systemPrompt}`,
          ].join('\n\n'),
          inputSchema: promptInputSchema,
          execute: (input: Record<string, unknown>) => {
            if (hasOwn(input, 'teacherSystemPrompt')) {
              const prompt = requireString(input, 'teacherSystemPrompt');
              if (!prompt.trim()) throw new Error('teacherSystemPrompt cannot be empty when supplied.');
              setPromptModeTeacher('custom');
              setTeacherConfig({ ...teacherConfig, systemPrompt: prompt });
            }
            if (hasOwn(input, 'studentSystemPrompt')) {
              const prompt = requireString(input, 'studentSystemPrompt');
              if (!prompt.trim()) throw new Error('studentSystemPrompt cannot be empty when supplied.');
              setPromptModeStudent('custom');
              setStudentConfig({ ...studentConfig, systemPrompt: prompt });
            }
            return result('Examination system prompts finalized. Omitted prompts were kept unchanged.');
          },
        });
        register({
          name: 'lobasters_start_examination',
          description: 'Start the configured Examination. This begins live provider requests with the researcher-configured models and may consume provider credits.',
          inputSchema: noInputSchema,
          execute: async () => {
            await onStart();
            return result('Examination is starting. Live status will be available while the models work.');
          },
        });
      }
    };

    registerTools();
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    step, teacherConfig, setTeacherConfig, studentConfig, setStudentConfig, examConfig, setExamConfig,
    promptModeTeacher, setPromptModeTeacher, promptModeStudent, setPromptModeStudent, state,
    onContinueToReview, onStart, onReset, onDownloadReport,
  ]);

  return null;
}
