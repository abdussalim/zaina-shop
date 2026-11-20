import { ZodError } from 'zod'

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function zodFields(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'form'
    fields[path] = [...(fields[path] ?? []), issue.message]
  }
  return fields
}
