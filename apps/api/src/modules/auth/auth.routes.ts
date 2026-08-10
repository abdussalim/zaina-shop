import { Router, type Request, type RequestHandler } from 'express'
import rateLimit from 'express-rate-limit'
import { loginInputSchema } from '@zaina/shared'

import { AppError } from '../../http/errors.js'
import { sendData } from '../../http/respond.js'
import type { AuthService } from './auth.service.js'

export const requireSession: RequestHandler = (request, _response, next) => {
  if (!request.session?.user) {
    next(new AppError(401, 'UNAUTHORIZED', 'Silakan masuk terlebih dahulu'))
    return
  }
  next()
}

function regenerateSession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => (error ? reject(error) : resolve()))
  })
}

function destroySession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => (error ? reject(error) : resolve()))
  })
}

export function validateAuthenticatedSession(
  authService: AuthService,
): RequestHandler {
  return async (request, _response, next) => {
    const user = request.session.user
    if (!user) {
      next()
      return
    }

    const passwordChangedAt = request.session.passwordChangedAt
    if (
      passwordChangedAt &&
      (await authService.isSessionCurrent(user.id, passwordChangedAt))
    ) {
      next()
      return
    }

    await destroySession(request)
    next()
  }
}

export function createAuthRouter(authService: AuthService): Router {
  const router = Router()
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(
        new AppError(
          429,
          'LOGIN_RATE_LIMITED',
          'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit',
        ),
      )
    },
  })

  router.post('/login', loginLimiter, async (request, response) => {
    const input = loginInputSchema.parse(request.body)
    const authenticated = await authService.authenticate(input.username, input.password)
    await regenerateSession(request)
    request.session.user = authenticated.user
    request.session.passwordChangedAt = authenticated.passwordChangedAt
    return sendData(response, authenticated.user)
  })

  router.post('/logout', requireSession, async (request, response) => {
    await destroySession(request)
    response.status(204).end()
  })

  router.get('/session', requireSession, (request, response) =>
    sendData(response, request.session.user),
  )

  return router
}
