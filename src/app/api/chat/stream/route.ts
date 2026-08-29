import OpenAI from 'openai';
import { toProviderFailure } from '@/app/proving-ground/flows/provider-result';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type StreamInput = {
  connection?: {
    baseURL?: string;
    apiKey?: string;
  };
  request?: Record<string, unknown>;
};

const encoder = new TextEncoder();
const event = (name: string, payload: unknown) =>
  encoder.encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);

/** Streams an OpenAI-compatible completion without exposing provider keys to the browser. */
export async function POST(request: Request) {
  let input: StreamInput;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: { message: 'Invalid streaming request.' } }, { status: 400 });
  }

  const baseURL = input.connection?.baseURL?.trim().replace(/\/$/, '');
  const apiKey = input.connection?.apiKey || process.env.OPENAI_API_KEY;
  const completionRequest = input.request;

  if (!baseURL || !apiKey || !completionRequest || typeof completionRequest.model !== 'string') {
    return Response.json({ error: { message: 'Model, provider URL, and API key are required.' } }, { status: 400 });
  }

  const providerAbortController = new AbortController();
  const abortProvider = () => providerAbortController.abort(request.signal.reason);
  if (request.signal.aborted) {
    abortProvider();
  } else {
    request.signal.addEventListener('abort', abortProvider, { once: true });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const openai = new OpenAI({
          baseURL,
          apiKey,
          defaultHeaders: {
            'HTTP-Referer': 'https://lobasters.vercel.app',
            'X-Title': 'Lobasters',
          },
        });
        const providerStream = await openai.chat.completions.create({
          ...completionRequest,
          stream: true,
        } as OpenAI.Chat.ChatCompletionCreateParamsStreaming, {
          signal: providerAbortController.signal,
        });

        const message: Record<string, any> = { role: 'assistant', content: '' };
        for await (const chunk of providerStream) {
          const delta = chunk.choices[0]?.delta as Record<string, any> | undefined;
          if (!delta) continue;

          if (typeof delta.content === 'string') {
            message.content = (message.content || '') + delta.content;
          }
          if (Array.isArray(delta.tool_calls)) {
            message.tool_calls ||= [];
            for (const toolCall of delta.tool_calls) {
              const existing = message.tool_calls[toolCall.index];
              if (!existing) {
                message.tool_calls[toolCall.index] = {
                  id: toolCall.id || '',
                  type: toolCall.type || 'function',
                  function: {
                    name: toolCall.function?.name || '',
                    arguments: toolCall.function?.arguments || '',
                  },
                };
              } else {
                if (toolCall.id) existing.id = toolCall.id;
                if (toolCall.type) existing.type = toolCall.type;
                if (toolCall.function?.name) existing.function.name += toolCall.function.name;
                if (toolCall.function?.arguments) existing.function.arguments += toolCall.function.arguments;
              }
            }
          }
          for (const [key, value] of Object.entries(delta)) {
            if (key !== 'role' && key !== 'content' && key !== 'tool_calls' && value != null) {
              message[key] = typeof message[key] === 'string' && typeof value === 'string'
                ? message[key] + value
                : value;
            }
          }
          controller.enqueue(event('delta', delta));
        }

        controller.enqueue(event('done', { message }));
      } catch (error) {
        if (!providerAbortController.signal.aborted) {
          controller.enqueue(event('error', toProviderFailure(error)));
        }
      } finally {
        request.signal.removeEventListener('abort', abortProvider);
        try {
          controller.close();
        } catch {
          // A canceled response stream is already closed by the runtime.
        }
      }
    },
    cancel() {
      providerAbortController.abort('Client stopped reading the provider stream.');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
