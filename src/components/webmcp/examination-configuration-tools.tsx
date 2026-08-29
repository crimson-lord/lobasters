'use client';

import { useEffect, useRef } from 'react';
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

const completeExaminationDescription = [
  'Configure the entire Examination in ONE WebMCP command. This is the primary agent-oriented setup tool.',
  'It can set both models, the grading scale, question count, domains, and either complete system prompt. Omit a property to preserve its current value.',
  'Use lobasters_get_examination_configuration first when you need to inspect the live form values, including both editable system prompts.',
  'API keys are write-only: they can be supplied but are never exposed in discovery or results.',
].join('\n\n');

function examinationConfigurationSnapshot({
  teacherConfig,
  studentConfig,
  examConfig,
  promptModeTeacher,
  promptModeStudent,
}: Pick<
  ExaminationConfigurationToolsProps,
  'teacherConfig' | 'studentConfig' | 'examConfig' | 'promptModeTeacher' | 'promptModeStudent'
>) {
  return JSON.stringify({
    teacher: {
      ...publicAgentConfiguration(teacherConfig),
      systemPrompt: teacherConfig.systemPrompt,
      systemPromptMode: promptModeTeacher,
    },
    student: {
      ...publicAgentConfiguration(studentConfig),
      systemPrompt: studentConfig.systemPrompt,
      systemPromptMode: promptModeStudent,
    },
    session: examConfig,
  }, null, 2);
}

function sanitizedTranscript(transcript: NonNullable<ProvingGroundState['transcript']>) {
  const copy = JSON.parse(JSON.stringify(transcript)) as Record<string, any>;
  if (copy.config?.teacher) delete copy.config.teacher.apiKey;
  if (copy.config?.student) delete copy.config.student.apiKey;
  return copy;
}

async function copyTranscriptToClipboard(rawTranscript: string) {
  try {
    await navigator.clipboard.writeText(rawTranscript);
    return;
  } catch {
    // WebMCP invocations do not always count as a browser activation. Fall
    // back to the legacy in-page copy path for runtimes that still permit it.
    const textarea = document.createElement('textarea');
    textarea.value = rawTranscript;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) {
      throw new Error('The browser denied clipboard access. Allow clipboard access and try again.');
    }
  }
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
  // WebMCP registrations persist in some browser runtimes even after their
  // abort signal fires. Keep registrations stable while the researcher types;
  // individual tools read this ref so they always operate on the live form.
  const latestRef = useRef<ExaminationConfigurationToolsProps>({
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
  });
  latestRef.current = {
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
  };
  const hasRegisteredToolsRef = useRef(false);

  const registrationPhase = state.status === 'running'
    ? 'running'
    : state.status === 'finished' || state.status === 'error'
      ? state.status
      : step;

  useEffect(() => {
    if (hasRegisteredToolsRef.current) return;
    hasRegisteredToolsRef.current = true;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const registerTools = () => {
      const modelContext = document.modelContext ?? navigator.modelContext;
      if (!modelContext) {
        if (attempts++ < 50) retryTimer = setTimeout(registerTools, 100);
        return;
      }
      const activeModelContext = modelContext;
      void activeModelContext.registerTool({
        name: 'lobasters_examination',
        description: [
          'Control the full Lobasters Examination through WebMCP. This persistent command avoids browser registration limits while the page changes phase.',
          'Use action "configure" to complete both model surveys, session values, and optional full prompts in ONE call. API keys are write-only.',
          'Use get_configuration to read all live editable values. Other actions are available when their matching phase exists: finalize_system_prompts, start, get_status, get_raw_transcript, copy_raw_transcript, download_report, and run_another.',
        ].join('\n\n'),
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: {
              type: 'string',
              enum: [
                'get_configuration',
                'configure',
                'finalize_system_prompts',
                'start',
                'get_status',
                'get_raw_transcript',
                'copy_raw_transcript',
                'download_report',
                'run_another',
              ],
              description: 'The Examination operation to perform.',
            },
            teacher: { ...agentInputSchema, description: 'Teacher fields used only with configure. Omitted fields are preserved.' },
            student: { ...agentInputSchema, description: 'Student fields used only with configure. Omitted fields are preserved.' },
            session: { ...sessionInputSchema, description: 'Session fields used only with configure. Omitted fields are preserved.' },
            teacherSystemPrompt: { type: 'string', description: 'Complete Teacher prompt for configure or finalize_system_prompts.' },
            studentSystemPrompt: { type: 'string', description: 'Complete Student prompt for configure or finalize_system_prompts.' },
            format: { type: 'string', enum: ['pdf', 'markdown'], description: 'Required for download_report.' },
          },
          required: ['action'],
        },
        execute: async (input: Record<string, unknown>) => {
          const action = requireString(input, 'action');
          const current = latestRef.current;
          const transcript = current.state.transcript;

          if (action === 'get_configuration') {
            return result(examinationConfigurationSnapshot(current));
          }
          if (action === 'configure') {
            if (current.step !== 'models') throw new Error('Configuration is available only before the Examination review step.');
            const teacherInput = optionalObject(input, 'teacher');
            const studentInput = optionalObject(input, 'student');
            const sessionInput = optionalObject(input, 'session');
            const nextTeacher = teacherInput ? patchAgent(current.teacherConfig, teacherInput) : current.teacherConfig;
            const nextStudent = studentInput ? patchAgent(current.studentConfig, studentInput) : current.studentConfig;
            const nextSession = sessionInput ? patchSession(current.examConfig, sessionInput) : current.examConfig;
            const teacherPrompt = hasOwn(input, 'teacherSystemPrompt') ? requireString(input, 'teacherSystemPrompt') : undefined;
            const studentPrompt = hasOwn(input, 'studentSystemPrompt') ? requireString(input, 'studentSystemPrompt') : undefined;
            if (teacherPrompt !== undefined && !teacherPrompt.trim()) throw new Error('teacherSystemPrompt cannot be empty when supplied.');
            if (studentPrompt !== undefined && !studentPrompt.trim()) throw new Error('studentSystemPrompt cannot be empty when supplied.');
            current.setTeacherConfig(teacherPrompt === undefined ? nextTeacher : { ...nextTeacher, systemPrompt: teacherPrompt });
            current.setStudentConfig(studentPrompt === undefined ? nextStudent : { ...nextStudent, systemPrompt: studentPrompt });
            current.setExamConfig(nextSession);
            if (teacherPrompt !== undefined) current.setPromptModeTeacher('custom');
            if (studentPrompt !== undefined) current.setPromptModeStudent('custom');
            current.onContinueToReview();
            return result(JSON.stringify({
              message: 'Entire Examination configuration saved in one command. Opening system-prompt review.',
              teacher: publicAgentConfiguration(nextTeacher),
              student: publicAgentConfiguration(nextStudent),
              session: nextSession,
            }, null, 2));
          }
          if (action === 'finalize_system_prompts') {
            if (current.step !== 'review') throw new Error('System prompts can be finalized only during review.');
            if (hasOwn(input, 'teacherSystemPrompt')) {
              const prompt = requireString(input, 'teacherSystemPrompt');
              if (!prompt.trim()) throw new Error('teacherSystemPrompt cannot be empty when supplied.');
              current.setPromptModeTeacher('custom');
              current.setTeacherConfig({ ...current.teacherConfig, systemPrompt: prompt });
            }
            if (hasOwn(input, 'studentSystemPrompt')) {
              const prompt = requireString(input, 'studentSystemPrompt');
              if (!prompt.trim()) throw new Error('studentSystemPrompt cannot be empty when supplied.');
              current.setPromptModeStudent('custom');
              current.setStudentConfig({ ...current.studentConfig, systemPrompt: prompt });
            }
            return result('Examination system prompts finalized. Omitted prompts were kept unchanged.');
          }
          if (action === 'start') {
            if (current.step !== 'review') throw new Error('The Examination must be configured and reviewed before it can start.');
            await current.onStart();
            return result('Examination is starting. Use get_status while the models work.');
          }
          if (action === 'get_status') {
            if (current.state.status !== 'running') throw new Error('No Examination is currently running.');
            return result(JSON.stringify({
              status: current.state.status,
              phase: current.state.currentPhase,
              completedTurns: transcript?.turns.length ?? 0,
              questionCount: current.state.config?.questionCount ?? null,
              activity: current.state.activityMessage,
            }, null, 2));
          }
          if (action === 'get_raw_transcript') {
            if (!transcript) throw new Error('No Examination transcript is available.');
            return result(JSON.stringify(sanitizedTranscript(transcript), null, 2));
          }
          if (action === 'copy_raw_transcript') {
            if (!transcript) throw new Error('No Examination transcript is available.');
            await copyTranscriptToClipboard(JSON.stringify(sanitizedTranscript(transcript), null, 2));
            return result('The sanitized raw Examination transcript was copied to the system clipboard.');
          }
          if (action === 'download_report') {
            if (current.state.status !== 'finished' || !transcript) throw new Error('A completed Examination report is required before downloading.');
            const format = requireString(input, 'format') as ReportFormat;
            if (format !== 'pdf' && format !== 'markdown') throw new Error('format must be pdf or markdown.');
            current.onDownloadReport(format);
            return result(`Downloading the completed Examination report as ${format === 'pdf' ? 'PDF' : 'Markdown'}.`);
          }
          if (action === 'run_another') {
            current.onReset();
            return result('Starting a new Examination. Returning to model configuration.');
          }
          throw new Error('Unsupported Examination action.');
        },
      }, { signal: controller.signal }).catch(() => {
        // The human-facing workflow remains usable when WebMCP is unavailable.
      });
      return;

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
          execute: () => {
            const { state: liveState } = latestRef.current;
            return result(JSON.stringify({
              status: liveState.status,
              phase: liveState.currentPhase,
              completedTurns: liveState.transcript?.turns.length ?? 0,
              questionCount: liveState.config?.questionCount ?? null,
              activity: liveState.activityMessage,
            }, null, 2));
          },
        });
        return;
      }

      if (state.status === 'finished' || state.status === 'error') {
        if (state.transcript) {
          register({
            name: 'lobasters_get_raw_examination_transcript',
            description: 'Return the complete raw Examination transcript, including requests and responses for every captured turn. API keys are removed.',
            inputSchema: noInputSchema,
            execute: () => {
              const transcript = latestRef.current.state.transcript;
              if (!transcript) throw new Error('No Examination transcript is available.');
              return result(JSON.stringify(sanitizedTranscript(transcript), null, 2));
            },
          });
          register({
            name: 'lobasters_copy_raw_examination_transcript',
            description:
              'Copy the complete API-key-sanitized raw Examination transcript to the system clipboard. This is a direct WebMCP action and does not use the researcher-facing button.',
            inputSchema: noInputSchema,
            execute: async () => {
              const transcript = latestRef.current.state.transcript;
              if (!transcript) throw new Error('No Examination transcript is available.');
              const rawTranscript = JSON.stringify(sanitizedTranscript(transcript), null, 2);
              await copyTranscriptToClipboard(rawTranscript);
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
              latestRef.current.onDownloadReport(format);
              return result(`Downloading the completed Examination report as ${format === 'pdf' ? 'PDF' : 'Markdown'}.`);
            },
          });
        }
        register({
          name: 'lobasters_run_another_examination',
          description: 'Clear the current Examination session and return to the Teacher and Student configuration surveys.',
          inputSchema: noInputSchema,
          execute: () => {
            latestRef.current.onReset();
            return result('Starting a new Examination. Returning to model configuration.');
          },
        });
        return;
      }

      if (step === 'models') {
        register({
          name: 'lobasters_get_examination_configuration',
          description: 'Read the live Examination configuration, including both editable system prompts. API keys remain write-only.',
          inputSchema: noInputSchema,
          execute: () => result(examinationConfigurationSnapshot(latestRef.current)),
        });
        register({
          name: 'lobasters_configure_examination',
          description: completeExaminationDescription,
          inputSchema: completeExaminationInputSchema,
          execute: (input: Record<string, unknown>) => {
            const current = latestRef.current;
            const teacherInput = optionalObject(input, 'teacher');
            const studentInput = optionalObject(input, 'student');
            const sessionInput = optionalObject(input, 'session');
            const nextTeacher = teacherInput ? patchAgent(current.teacherConfig, teacherInput) : current.teacherConfig;
            const nextStudent = studentInput ? patchAgent(current.studentConfig, studentInput) : current.studentConfig;
            const nextSession = sessionInput ? patchSession(current.examConfig, sessionInput) : current.examConfig;

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

            current.setTeacherConfig(teacherPrompt === undefined
              ? nextTeacher
              : { ...nextTeacher, systemPrompt: teacherPrompt });
            current.setStudentConfig(studentPrompt === undefined
              ? nextStudent
              : { ...nextStudent, systemPrompt: studentPrompt });
            current.setExamConfig(nextSession);
            if (teacherPrompt !== undefined) current.setPromptModeTeacher('custom');
            if (studentPrompt !== undefined) current.setPromptModeStudent('custom');
            current.onContinueToReview();

            return result(JSON.stringify({
              message: 'Entire Examination configuration saved in one command. Opening system-prompt review.',
              teacher: publicAgentConfiguration(nextTeacher),
              student: publicAgentConfiguration(nextStudent),
              session: nextSession,
              teacherPromptMode: teacherPrompt === undefined ? current.promptModeTeacher : 'custom',
              studentPromptMode: studentPrompt === undefined ? current.promptModeStudent : 'custom',
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
            const current = latestRef.current;
            const next = patchSession(current.examConfig, input);
            current.setExamConfig(next);
            current.onContinueToReview();
            return result(`Examination parameters saved. Current session:\n${JSON.stringify(next, null, 2)}`);
          },
        });
        return;
      }

      if (step === 'review') {
        register({
          name: 'lobasters_get_examination_configuration',
          description: 'Read the live Examination configuration, including both editable system prompts. API keys remain write-only.',
          inputSchema: noInputSchema,
          execute: () => result(examinationConfigurationSnapshot(latestRef.current)),
        });
        register({
          name: 'lobasters_finalize_examination_system_prompts',
          description: 'Optionally replace either complete Examination system prompt. Omit a prompt to keep it unchanged. Use lobasters_get_examination_configuration to inspect the live prompts first.',
          inputSchema: promptInputSchema,
          execute: (input: Record<string, unknown>) => {
            const current = latestRef.current;
            if (hasOwn(input, 'teacherSystemPrompt')) {
              const prompt = requireString(input, 'teacherSystemPrompt');
              if (!prompt.trim()) throw new Error('teacherSystemPrompt cannot be empty when supplied.');
              current.setPromptModeTeacher('custom');
              current.setTeacherConfig({ ...current.teacherConfig, systemPrompt: prompt });
            }
            if (hasOwn(input, 'studentSystemPrompt')) {
              const prompt = requireString(input, 'studentSystemPrompt');
              if (!prompt.trim()) throw new Error('studentSystemPrompt cannot be empty when supplied.');
              current.setPromptModeStudent('custom');
              current.setStudentConfig({ ...current.studentConfig, systemPrompt: prompt });
            }
            return result('Examination system prompts finalized. Omitted prompts were kept unchanged.');
          },
        });
        register({
          name: 'lobasters_start_examination',
          description: 'Start the configured Examination. This begins live provider requests with the researcher-configured models and may consume provider credits.',
          inputSchema: noInputSchema,
          execute: async () => {
            await latestRef.current.onStart();
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
  }, []);

  return null;
}
