import OpenAI from 'openai';
import { ProvingGroundAgentConfig, ModelOutput } from '../types';
import { ProviderResult, toProviderFailure } from './provider-result';
import { collectChatCompletion } from '@/lib/chat-stream';

interface StudentTurnInput {
  prompt: string; 
  studentConfig: ProvingGroundAgentConfig;
}

export async function runStudentTurn(input: StudentTurnInput): Promise<ProviderResult<ModelOutput>> {
  try {
    const { prompt, studentConfig } = input;
  
    const apiKey = studentConfig.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return { ok: false, error: { message: 'No API key found. Enter a key in Student Settings.', retryable: false } };
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: studentConfig.systemPrompt },
      { role: 'user', content: prompt }
    ];

    const requestPayload: any = {
      model: studentConfig.modelName,
      messages: messages,
      temperature: studentConfig.temperature,
      max_tokens: studentConfig.maxTokens,
      ...(studentConfig.canThink ? { extra_body: { include_reasoning: true } } : {}),
    };

    const { rawRequest, rawResponse } = await collectChatCompletion(
      { baseURL: studentConfig.baseURL, apiKey },
      requestPayload,
    );

    if (!rawResponse.content && !rawResponse.tool_calls) {
      return { ok: false, error: { message: 'Student model returned an empty response.', retryable: true } };
    }

    return { ok: true, value: { rawRequest, rawResponse: rawResponse as OpenAI.Chat.ChatCompletionMessage } };
  } catch (error) {
    return { ok: false, error: toProviderFailure(error) };
  }
}
