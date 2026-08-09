export * from './domain.js'
export * from './schemas.js'

export interface ApiSuccess<T> {
  data: T
  meta?: Record<string, unknown>
}

export interface ApiErrorPayload {
  code: string
  message: string
  fields?: Record<string, string[]>
  requestId: string
}

export interface ApiErrorEnvelope {
  error: ApiErrorPayload
}
