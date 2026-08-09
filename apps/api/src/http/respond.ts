import type { Response } from 'express'

export function sendData<T>(response: Response, data: T, status = 200) {
  return response.status(status).json({ data })
}
