import { ZodError } from 'zod'
import type { ErrorRequestHandler } from 'express'

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message)
  }
}

function zodFields(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'form'
    fields[path] = [...(fields[path] ?? []), issue.message]
  }
  return fields
}

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Data yang dikirim belum valid',
        fields: zodFields(error),
        requestId: request.id,
      },
    })
    return
  }

  const parserError = error as { type?: string }
  if (parserError.type === 'entity.parse.failed') {
    sendAppError(
      response,
      request.id,
      new AppError(400, 'INVALID_JSON', 'Format JSON tidak valid'),
    )
    return
  }
  if (parserError.type === 'entity.too.large') {
    sendAppError(
      response,
      request.id,
      new AppError(413, 'PAYLOAD_TOO_LARGE', 'Data yang dikirim terlalu besar'),
    )
    return
  }

  const appError =
    error instanceof AppError
      ? error
      : new AppError(500, 'INTERNAL_ERROR', 'Terjadi kesalahan pada server')

  if (appError.status >= 500) request.log?.error({ error }, 'request failed')
  sendAppError(response, request.id, appError)
}

function sendAppError(
  response: Parameters<ErrorRequestHandler>[2],
  requestId: unknown,
  appError: AppError,
) {
  response.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.fields ? { fields: appError.fields } : {}),
      requestId,
    },
  })
}
