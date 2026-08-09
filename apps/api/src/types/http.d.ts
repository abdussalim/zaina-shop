import type { PublicUser } from '../modules/auth/auth.service.js'

declare module 'express-session' {
  interface SessionData {
    user?: PublicUser
  }
}

export {}
