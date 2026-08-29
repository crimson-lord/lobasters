'use client';

export interface StreamConnection {
  baseURL: string;
  apiKey?: string;
}

export interface StreamFailure {
  message: string;
  status?: number;
  retryable?: boolean;
}

export interface StreamCompletionOptions {
  signal?: AbortSignal;
}

export class StreamCompletionError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'StreamCompletionError';
  }
}

export async function collectChatCompletion(
  connection: StreamConnection,
  request: Record<string, unknown>,
  onDelta?: (delta: Record<string, unknown>) => void,
  options: StreamCompletionOptions = {},
): Promise<{ rawRequest: Record<string, unknown>; rawResponse: Record<string, any> }> {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection, request }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    let failure: StreamFailure | undefined;
    try {
      failure = (await response.json()).error;
    } catch {
      // Use the HTTP status fallback below.
    }
    throw new StreamCompletionError(
      failure?.message || `Streaming request failed (HTTP ${response.status}).`,
      failure?.status || response.status,
      failure?.retryable || response.status >= 500,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed: Record<string, any> | null = null;

  const handleEvent = (block: string) => {
    const name = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const data = block.match(/^data:\s*(.+)$/m)?.[1];
    if (!name || !data) return;
    const payload = JSON.parse(data);
    if (name === 'delta') onDelta?.(payload);
    if (name === 'done') completed = payload.message;
    if (name === 'error') {
      const failure = payload as StreamFailure;
      throw new StreamCompletionError(failure.message, failure.status, failure.retryable);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';
    for (const block of blocks) handleEvent(block);
    if (done) break;
  }

  if (!completed) {
    throw new StreamCompletionError('Provider stream ended before it returned a completed message.', undefined, true);
  }
  return { rawRequest: request, rawResponse: completed };
}
