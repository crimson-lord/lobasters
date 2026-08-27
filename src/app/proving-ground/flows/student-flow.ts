'use server';
import OpenAI from 'openai';
import { ProvingGroundAgentConfig, ModelOutput } from '../types';

interface StudentTurnInput {
  prompt: string; 
  studentConfig: ProvingGroundAgentConfig;
}

export async function runStudentTurn(input: StudentTurnInput): Promise<ModelOutput> {
  const { prompt, studentConfig } = input;
  
  const apiKey = studentConfig.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("No API key found. Please enter your API key in the Student Settings.");
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
    throw new Error('Student model returned no choices in API response.');
  }

  const message = llmResponse.choices[0].message;

  if (!message.content && !message.tool_calls) {
    throw new Error('Student model returned an empty response.');
  }

  return {
    rawRequest: requestPayload,
    rawResponse: message
  };
}
