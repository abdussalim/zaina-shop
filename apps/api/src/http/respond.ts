import type { Context } from 'hono'

export function sendData<T>(c: Context, data: T, status: 200 | 201 = 200) {
  return c.json({ data }, status)
}
