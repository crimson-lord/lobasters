import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  LM0Config,
  LLMConnectionConfig,
  VirtualFileId,
} from '../types';
import OpenAI from 'openai';
import { collectChatCompletion } from '@/lib/chat-stream';

const createFileIdEnum = (config: LM0Config) => {
    const allowedFiles = config.allowedFiles;
    
    if (allowedFiles.length === 0) {
        // Zod enum must have at least one value, this is a fallback.
        return z.enum([' ']);
    }
    
    return z.enum(allowedFiles as [string, ...string[]]);
};

export async function runMasterAgentTurn(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], config: LM0Config): Promise<OpenAI.Chat.ChatCompletionMessage> {
  const masterConfig = config.masterAgent;

  const apiKey = masterConfig.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("No API key found. Please enter your API key in the Master Agent Settings.");
  }

  const systemMessage = messages.find(m => m.role === 'system');
  const otherMessages = messages.filter(m => m.role !== 'system');
  const slicedOtherMessages = masterConfig.maxHistory ? otherMessages.slice(-masterConfig.maxHistory) : otherMessages;
  const messagesForApi = systemMessage ? [systemMessage, ...slicedOtherMessages] : slicedOtherMessages;

  const AllowedFileIdEnum = createFileIdEnum(config);

  const messageToMeSchema = z.object({
    message: z.string().describe("Your thought or plan for the next turn. This is your internal monologue."),
  });

  const readFileSchema = z.object({
    fileId: AllowedFileIdEnum.describe("The ID of the file to read."),
  });

  const writableFiles = config.allowedFiles.filter(f => f !== 'manual.md' && f !== 'question-bank.md');

  const writeFileSchema = z.object({
    fileId: writableFiles.length > 0 ? z.enum(writableFiles as [string, ...string[]]) : z.enum([' ']),
    content: z.string().describe("The full content to write to the file, overwriting existing content."),
  });
  
  const callLlmToolSchema = z.object({
    llm_connection_id: z.string().describe("The ID of the LLM connection to use (e.g., 'llm-1')."),
    prompt: z.string().describe("The prompt to send to the subordinate LLM."),
  });
  
  const finishChallengeSchema = z.object({
    challenge_number: z.number().describe("The number of the challenge being marked as complete."),
  });
  
  const rollbackStepSchema = z.object({
    turn_number: z.number().describe("The sequential turn number to roll back to. The agent will resume its next turn from this point."),
  });
  
  const finishSessionSchema = z.object({
    final_thoughts: z.string().optional().describe("Optional final thoughts or summary of the session."),
  });

  const uploadQuestionSchema = z.object({
      challenge_number: z.number().describe("The number of the challenge for which to upload the question."),
      content: z.string().describe("The full text content of the question. This will be appended to question-bank.md."),
  });

  const uploadAnswerSchema = z.object({
      challenge_number: z.number().describe("The number of the challenge for which to upload the answer."),
      fileId: AllowedFileIdEnum.describe("The ID of the file containing the answer (e.g. 'pre-answer.md' or 'final-answer.md')."),
  });

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    { type: 'function', function: { name: 'message_to_me', description: 'REQUIRED IN EVERY TURN. Sets your internal monologue and plan for the next turn.', parameters: zodToJsonSchema(messageToMeSchema) } },
    { type: 'function', function: { name: 'read_file', description: 'Reads the content of an allowed virtual markdown file.', parameters: zodToJsonSchema(readFileSchema) } },
    { type: 'function', function: { name: 'upload_answer', description: "Uploads an answer for a specific challenge from one of the virtual files.", parameters: zodToJsonSchema(uploadAnswerSchema) } },
    { type: 'function', function: { name: 'ROLLBACK_STEP', description: 'Rewinds the session to a specific turn number to retry if the agent gets stuck or makes a mistake.', parameters: zodToJsonSchema(rollbackStepSchema) } },
    { type: 'function', function: { name: 'FINISH_SESSION', description: 'Ends the session after all challenges are complete.', parameters: zodToJsonSchema(finishSessionSchema) } },
  ];

  if (config.questionSource === 'agent') {
      tools.push({ type: 'function', function: { name: 'upload_question', description: 'Generates and uploads a new question to the `question-bank.md` file.', parameters: zodToJsonSchema(uploadQuestionSchema) } });
      tools.push({ type: 'function', function: { name: 'finish_challenge', description: 'Marks one of the agent-generated challenges as complete.', parameters: zodToJsonSchema(finishChallengeSchema) } });
  }
  
  if (writableFiles.length > 0) {
      tools.push({ type: 'function', function: { name: 'write_file', description: 'Writes content to an allowed virtual markdown file, overwriting it.', parameters: zodToJsonSchema(writeFileSchema) } });
  }

  if (config.allowHelperAgents) {
    tools.push({ type: 'function', function: { name: 'call_llm_tool', description: 'Calls a subordinate LLM tool with a given prompt.', parameters: zodToJsonSchema(callLlmToolSchema) } });
  }
  
  const requestPayload: OpenAI.Chat.ChatCompletionCreateParams = {
      model: masterConfig.modelName,
      temperature: masterConfig.temperature,
      messages: messagesForApi,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' as const : undefined,
      ...(masterConfig.canThink ? { extra_body: { include_reasoning: true } } : {}),
  };

  const { rawResponse } = await collectChatCompletion(
    { baseURL: masterConfig.baseURL, apiKey },
    requestPayload as unknown as Record<string, unknown>,
  );

  if (!rawResponse) {
    throw new Error('Master Agent returned an empty message from the API.');
  }

  return rawResponse as OpenAI.Chat.ChatCompletionMessage;
}

interface LLMToolOutput {
    request: any;
    response: string;
}

interface LLMToolInput {
    config: LLMConnectionConfig;
    prompt: string;
}

export async function runLLMTool({ config, prompt }: LLMToolInput): Promise<LLMToolOutput> {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error(`No API key found for Helper Agent '${config.nickname}'. Please check your settings.`);
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: prompt }
    ];

    const requestPayload: OpenAI.Chat.ChatCompletionCreateParams = {
        model: config.modelName,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        messages,
        ...(config.canThink ? { extra_body: { include_reasoning: true } } : {}),
    };

    const { rawRequest, rawResponse } = await collectChatCompletion(
        { baseURL: config.baseURL, apiKey },
        requestPayload as unknown as Record<string, unknown>,
    );

    const content = rawResponse.content;
    if (!content) {
        throw new Error("Subordinate LLM returned an empty response.");
    }
    return { request: rawRequest, response: content };
}
