import type { ApiErrorEnvelope, ApiSuccess } from '@zaina/shared'

export const SESSION_EXPIRED_EVENT = 'zaina:session-expired'

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string[]>,
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | ApiErrorEnvelope
      | undefined
    const error = new ApiClientError(
      response.status,
      payload?.error.code ?? 'REQUEST_FAILED',
      payload?.error.message ?? 'Permintaan tidak dapat diproses',
      payload?.error.fields,
      payload?.error.requestId,
    )
    if (
      response.status === 401 &&
      path !== '/api/v1/auth/login' &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }
    throw error
  }
  if (response.status === 204) return undefined as T
  const payload = (await response.json()) as ApiSuccess<T>
  return payload.data
}

export function jsonBody(value: unknown): Pick<RequestInit, 'body'> {
  return { body: JSON.stringify(value) }
}
