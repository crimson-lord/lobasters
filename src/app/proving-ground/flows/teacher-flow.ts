import OpenAI from 'openai';
import { ProvingGroundAgentConfig, ApiMessage, ModelOutput, GradingScale } from '../types';
import { ProviderResult, toProviderFailure } from './provider-result';
import { collectChatCompletion } from '@/lib/chat-stream';

const getTools = (gradingScale: GradingScale): OpenAI.Chat.Completions.ChatCompletionTool[] => {
    let validRanks: string[] = ['S', 'A', 'B', 'F'];
    if (gradingScale === 'ABF') validRanks = ['A', 'B', 'F'];
    if (gradingScale === 'AF') validRanks = ['A', 'F'];
    if (gradingScale === 'SAF') validRanks = ['S', 'A', 'F'];

    return [
        {
            type: 'function',
            function: {
                name: 'askQuestion',
                description: 'Asks the next question to the student.',
                parameters: {
                    type: 'object',
                    properties: {
                        next_question: {
                            type: 'string',
                            description: 'The full text of the question to ask the student.',
                        },
                    },
                    required: ['next_question'],
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'provideEvaluation',
                description: "Provides an evaluation of the student's most recent answer.",
                parameters: {
                    type: 'object',
                    properties: {
                        grade: {
                            type: 'string',
                            enum: validRanks,
                            description: 'The grade assigned to the student\'s answer, from the allowed list.',
                        },
                        reason: {
                            type: 'string',
                            description: 'A concise reason for the assigned grade.',
                        },
                        message_to_student: {
                            type: 'string',
                            description: "An optional, encouraging, or clarifying message to the student.",
                        },
                    },
                    required: ['grade', 'reason'],
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'provideSummary',
                description: "Provides a final summary of the student's overall performance after the exam is complete.",
                parameters: {
                    type: 'object',
                    properties: {
                        final_summary: {
                            type: 'string',
                            description: "A comprehensive overview of the student's performance, highlighting strengths and weaknesses.",
                        },
                    },
                    required: ['final_summary'],
                },
            },
        },
    ];
}


interface TeacherTurnInput {
  history: ApiMessage[];
  teacherConfig: ProvingGroundAgentConfig;
  prompt: string;
  gradingScale: GradingScale;
}

export async function runTeacherTurn(
  input: TeacherTurnInput
): Promise<ProviderResult<ModelOutput>> {
  try {
    const { prompt, teacherConfig, history, gradingScale } = input;

    const apiKey = teacherConfig.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return { ok: false, error: { message: 'No API key found. Enter a key in Teacher Settings.', retryable: false } };
    }

    const slicedHistory = teacherConfig.maxHistory ? history.slice(-teacherConfig.maxHistory) : history;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: teacherConfig.systemPrompt },
      ...slicedHistory,
      { role: 'user', content: prompt },
    ];

    const tools = getTools(gradingScale);

    const requestPayload: any = {
      model: teacherConfig.modelName,
      messages: messages,
      tools: tools,
      tool_choice: 'auto' as const,
      temperature: teacherConfig.temperature,
      max_tokens: teacherConfig.maxTokens,
      ...(teacherConfig.canThink ? { extra_body: { include_reasoning: true } } : {}),
    };

    const { rawRequest, rawResponse } = await collectChatCompletion(
      { baseURL: teacherConfig.baseURL, apiKey },
      requestPayload,
    );

    return { ok: true, value: { rawRequest, rawResponse: rawResponse as OpenAI.Chat.ChatCompletionMessage } };
  } catch (error) {
    return { ok: false, error: toProviderFailure(error) };
  }
}
