import type { D1Database, Fetcher, R2Bucket } from '@cloudflare/workers-types'

export interface SessionUser {
  id: string
  username: string
  displayName: string
}

export interface Env {
  Bindings: {
    DB: D1Database
    IMAGES?: R2Bucket
    SESSION_SECRET?: string
    MONITOR_AGENT_KEY?: string
    ASSETS?: Fetcher
  }
  Variables: {
    user?: SessionUser
    requestId: string
  }
}
