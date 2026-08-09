import express, { type Express } from 'express'
import session, { type Store } from 'express-session'
import helmet from 'helmet'
import pino from 'pino'
import { pinoHttp } from 'pino-http'

import type { AppConfig } from './config.js'
import type { Database } from './db/database.js'
import { AppError, errorHandler } from './http/errors.js'
import { requestContext } from './http/request-context.js'
import { sendData } from './http/respond.js'
import { trustedOrigin } from './http/trusted-origin.js'
import { createAuthRouter } from './modules/auth/auth.routes.js'
import { createAuthService } from './modules/auth/auth.service.js'

export interface AppDependencies {
  config: AppConfig
  database: Database
  sessionStore: Store
}

export function createApp(dependencies: AppDependencies): Express {
  const { config, database, sessionStore } = dependencies
  const app = express()
  const logger = pino({ level: config.nodeEnv === 'test' ? 'silent' : 'info' })

  app.disable('x-powered-by')
  if (config.isProduction) app.set('trust proxy', 1)
  app.use(requestContext)
  app.use(pinoHttp({ logger }))
  app.use(helmet())
  app.use(express.json({ limit: '1mb' }))
  app.use(trustedOrigin(config.appOrigin))
  app.use(
    session({
      name: 'zaina.sid',
      secret: config.sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProduction,
        maxAge: 12 * 60 * 60 * 1_000,
      },
    }),
  )

  const authService = createAuthService(database)
  app.get('/api/v1/health', async (_request, response) => {
    await database.query('SELECT 1')
    return sendData(response, { status: 'ok' })
  })
  app.use('/api/v1/auth', createAuthRouter(authService))

  app.use((_request, _response, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Alamat API tidak ditemukan'))
  })
  app.use(errorHandler)
  return app
}
