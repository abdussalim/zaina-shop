import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { Env, SessionUser } from '../env.js'
import { AppError } from '../http/errors.js'
import { verifySessionToken } from '../utils/jwt.js'
import { createD1Database } from '../db/d1.js'

const DEFAULT_SECRET = 'zaina-default-secret-change-in-prod-32chars!'

export function getSessionSecret(env: Env['Bindings']): string {
  return env.SESSION_SECRET || DEFAULT_SECRET
}

export const sessionMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  const secret = getSessionSecret(c.env)
  const token =
    getCookie(c, 'zaina_session') ||
    getCookie(c, 'zaina.sid') ||
    c.req.header('Authorization')?.replace(/^Bearer\s+/i, '')

  if (token) {
    const payload = await verifySessionToken(token, secret)
    if (payload?.user) {
      const db = createD1Database(c.env.DB)
      const result = await db.query<{ id: string; is_active: number }>(
        'SELECT id, is_active FROM users WHERE id = ?1 AND is_active = 1',
        [payload.user.id],
      )
      if (result.rows.length > 0) {
        c.set('user', payload.user as SessionUser)
      }
    }
  }

  await next()
}

export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  const user = c.get('user')
  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Silakan masuk terlebih dahulu')
  }
  await next()
}
