import { Hono, type MiddlewareHandler } from 'hono'
import {
  monitorAgentEventInputSchema,
  monitorCameraIdSchema,
  monitorCameraInputSchema,
  monitorConfigInputSchema,
  monitorDoorInputSchema,
  monitorHeartbeatInputSchema,
  monitorModeInputSchema,
} from '@zaina/shared'
import type { Env } from '../env.js'
import { createD1Database } from '../db/d1.js'
import { AppError } from '../http/errors.js'
import { sendData } from '../http/respond.js'
import { requireAuth } from '../middleware/auth.js'
import { createMonitorService } from '../modules/monitor/monitor.service.js'

const DEFAULT_AGENT_KEY = 'zaina-edge-dev-key'
const MAX_FRAME_BYTES = 2 * 1024 * 1024 // 2 MB

async function constantTimeEquals(provided: string | undefined, expected: string): Promise<boolean> {
  if (!provided) return false
  const encoder = new TextEncoder()
  const [aBuf, bBuf] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const a = new Uint8Array(aBuf)
  const b = new Uint8Array(bBuf)
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

const staffMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  c.header('Cache-Control', 'no-store')
  return requireAuth(c, next)
}

const requireAgentKey: MiddlewareHandler<Env> = async (c, next) => {
  c.header('Cache-Control', 'no-store')
  const expectedKey = c.env.MONITOR_AGENT_KEY || DEFAULT_AGENT_KEY
  const headerKey = c.req.header('x-monitor-agent-key')?.trim()
  const authHeader = c.req.header('authorization')
  const bearerKey = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  const providedKey = headerKey || bearerKey

  const valid = await constantTimeEquals(providedKey, expectedKey)
  if (!valid) {
    throw new AppError(401, 'UNAUTHORIZED_AGENT', 'Kunci agen monitor tidak valid')
  }
  await next()
}

export const monitorRoutes = new Hono<Env>()

// Staff Authenticated Routes
monitorRoutes.get('/state', staffMiddleware, async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createMonitorService(db)
  return sendData(c, await service.getSnapshot())
})

monitorRoutes.patch('/door', staffMiddleware, async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createMonitorService(db)
  const body = await c.req.json().catch(() => ({}))
  const input = monitorDoorInputSchema.parse(body)
  return sendData(c, await service.setDoor(input.closed))
})

monitorRoutes.patch('/mode', staffMiddleware, async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createMonitorService(db)
  const body = await c.req.json().catch(() => ({}))
  const input = monitorModeInputSchema.parse(body)
  return sendData(c, await service.setMode(input.mode))
})

monitorRoutes.patch('/camera', staffMiddleware, async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createMonitorService(db)
  const body = await c.req.json().catch(() => ({}))
  const input = monitorCameraInputSchema.parse(body)
  return sendData(c, await service.setCamera(input.cam, input.active))
})

monitorRoutes.patch('/config', staffMiddleware, async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createMonitorService(db)
  const body = await c.req.json().catch(() => ({}))
  const input = monitorConfigInputSchema.parse(body)
  return sendData(c, await service.setConfig(input.streamBaseUrl))
})

monitorRoutes.get('/frames/:cam', staffMiddleware, async (c) => {
  const cam = monitorCameraIdSchema.parse(c.req.param('cam'))
  if (!c.env.IMAGES) {
    throw new AppError(
      500,
      'R2_NOT_CONFIGURED',
      'Penyimpanan Cloudflare R2 belum terhubung atau belum diaktifkan',
    )
  }

  const key = `monitor/latest-${cam}.jpg`
  const object = await c.env.IMAGES.get(key)
  if (!object) {
    throw new AppError(404, 'FRAME_NOT_FOUND', 'Frame kamera belum tersedia')
  }

  return new Response(object.body as any, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'no-store',
    },
  })
})

// Edge Agent Routes
monitorRoutes.post('/agent/heartbeat', requireAgentKey, async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createMonitorService(db)
  const body = await c.req.json().catch(() => ({}))
  const input = monitorHeartbeatInputSchema.parse(body)
  return sendData(c, await service.recordHeartbeat(input))
})

monitorRoutes.post('/agent/frame/:cam', requireAgentKey, async (c) => {
  const cam = monitorCameraIdSchema.parse(c.req.param('cam'))
  if (!c.env.IMAGES) {
    throw new AppError(
      500,
      'R2_NOT_CONFIGURED',
      'Penyimpanan Cloudflare R2 belum terhubung atau belum diaktifkan',
    )
  }

  const buffer = await c.req.arrayBuffer()
  if (buffer.byteLength === 0) {
    throw new AppError(400, 'EMPTY_FRAME', 'Data frame JPEG tidak boleh kosong')
  }
  if (buffer.byteLength > MAX_FRAME_BYTES) {
    throw new AppError(413, 'FRAME_TOO_LARGE', 'Ukuran frame maksimal 2 MB')
  }

  const key = `monitor/latest-${cam}.jpg`
  await c.env.IMAGES.put(key, buffer, {
    httpMetadata: {
      contentType: 'image/jpeg',
    },
  })

  const db = createD1Database(c.env.DB)
  const service = createMonitorService(db)
  await service.touchHeartbeat()

  return sendData(c, {
    ok: true,
    cam,
    bytes: buffer.byteLength,
  })
})

monitorRoutes.post('/agent/events', requireAgentKey, async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createMonitorService(db)
  const body = await c.req.json().catch(() => ({}))
  const input = monitorAgentEventInputSchema.parse(body)
  return sendData(c, await service.recordAgentEvent(input))
})
