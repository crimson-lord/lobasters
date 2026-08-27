'use server';
import OpenAI from 'openai';
import { ProvingGroundAgentConfig, ModelOutput } from '../types';
import { ProviderResult, toProviderFailure } from './provider-result';

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

    const openai = new OpenAI({
      baseURL: studentConfig.baseURL.trim().replace(/\/$/, ''),
      apiKey: apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://lobasters.vercel.app",
        "X-Title": "Lobasters",
      }
    });

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

    const llmResponse = await openai.chat.completions.create(requestPayload);
  
    if (!llmResponse.choices || llmResponse.choices.length === 0) {
      return { ok: false, error: { message: 'Student model returned no choices in its response.', retryable: true } };
    }

    const message = llmResponse.choices[0].message;

    if (!message.content && !message.tool_calls) {
      return { ok: false, error: { message: 'Student model returned an empty response.', retryable: true } };
    }

    return { ok: true, value: { rawRequest: requestPayload, rawResponse: message } };
  } catch (error) {
    return { ok: false, error: toProviderFailure(error) };
  }
}
