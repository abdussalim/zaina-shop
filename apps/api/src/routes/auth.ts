import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { loginInputSchema } from '@zaina/shared'
import type { Env } from '../env.js'
import { AppError } from '../http/errors.js'
import { sendData } from '../http/respond.js'
import { requireAuth, getSessionSecret } from '../middleware/auth.js'
import { createD1Database } from '../db/d1.js'
import { findActiveUserByUsername } from '../modules/auth/auth.repository.js'
import { verifyPassword } from '../utils/crypto.js'
import { signSessionToken } from '../utils/jwt.js'

export const authRoutes = new Hono<Env>()

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const input = loginInputSchema.parse(body)

  const db = createD1Database(c.env.DB)
  const user = await findActiveUserByUsername(db, input.username)

  const passwordMatches = user
    ? await verifyPassword(input.password, user.password_hash)
    : false

  if (!user || !passwordMatches) {
    throw new AppError(
      401,
      'INVALID_CREDENTIALS',
      'Nama pengguna atau kata sandi salah',
    )
  }

  const publicUser = {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
  }

  const passwordChangedAt = new Date(user.password_changed_at).toISOString()
  const secret = getSessionSecret(c.env)
  const token = await signSessionToken(
    {
      user: publicUser,
      passwordChangedAt,
    },
    secret,
  )

  setCookie(c, 'zaina_session', token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  })

  return sendData(c, publicUser)
})

authRoutes.post('/logout', async (c) => {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: true,
  }
  deleteCookie(c, 'zaina_session', cookieOptions)
  deleteCookie(c, 'zaina.sid', cookieOptions)
  c.header('Cache-Control', 'no-store')
  return c.body(null, 204)
})

authRoutes.get('/session', requireAuth, (c) => {
  c.header('Cache-Control', 'no-store')
  return sendData(c, c.get('user'))
})
