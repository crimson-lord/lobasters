export interface ProviderFailure {
  message: string;
  status?: number;
  retryable: boolean;
}

export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProviderFailure };

/**
 * Server Action errors are deliberately hidden by Next.js in production. Turn
 * provider failures into a small, serializable result so the examination UI can
 * tell the researcher what to correct without exposing request secrets.
 */
export function toProviderFailure(error: unknown): ProviderFailure {
  const candidate = error as {
    message?: unknown;
    status?: unknown;
    code?: unknown;
  };
  const status = typeof candidate?.status === 'number' ? candidate.status : undefined;
  const message = typeof candidate?.message === 'string'
    ? candidate.message.replace(/\s+/g, ' ').trim().slice(0, 300)
    : '';

  if (status === 401 || status === 403) {
    return { status, retryable: false, message: 'Provider rejected the API key. Check the key and its permissions.' };
  }
  if (status === 404) {
    return { status, retryable: false, message: 'Provider could not find this endpoint or model. Check the base URL and model name.' };
  }
  if (status === 400 || status === 422) {
    return {
      status,
      retryable: false,
      message: 'Provider rejected this request. Check the model, endpoint, and whether the teacher model supports function calling.',
    };
  }
  if (status === 429) {
    return { status, retryable: true, message: 'Provider rate limit reached. Wait a moment, then try again.' };
  }
  if (status && status >= 500) {
    return { status, retryable: true, message: 'Provider is temporarily unavailable. Retrying may help.' };
  }

  return {
    status,
    retryable: !status,
    message: message || 'Could not reach the model provider. Check your connection and provider settings.',
  };
}
