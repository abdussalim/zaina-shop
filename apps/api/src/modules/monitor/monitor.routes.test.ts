import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import app from '../../index.js'
import { signSessionToken } from '../../utils/jwt.js'

const TEST_SESSION_SECRET = 'test-session-secret-for-monitor-routes-32'
const TEST_AGENT_KEY = 'test-monitor-agent-secret-key'

function createMockR2Bucket() {
  const objects = new Map<
    string,
    { body: Uint8Array; httpMetadata?: { contentType?: string } }
  >()

  return {
    objects,
    async put(
      key: string,
      value: ArrayBuffer | ArrayBufferView | string,
      options?: { httpMetadata?: { contentType?: string } },
    ) {
      const bytes =
        typeof value === 'string'
          ? new TextEncoder().encode(value)
          : value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)

      objects.set(key, {
        body: bytes,
        ...(options?.httpMetadata ? { httpMetadata: options.httpMetadata } : {}),
      })
      return { key, size: bytes.byteLength }
    },
    async get(key: string) {
      const entry = objects.get(key)
      if (!entry) return null
      return {
        key,
        body: entry.body,
        httpEtag: '"mock-etag"',
        writeHttpMetadata(headers: Headers) {
          if (entry.httpMetadata?.contentType) {
            headers.set('content-type', entry.httpMetadata.contentType)
          }
        },
      }
    },
  }
}

async function createMonitorTestContext() {
  const sqlite = new DatabaseSync(':memory:')

  const migrationsDir = fileURLToPath(
    new URL('../../../../../migrations', import.meta.url),
  )
  sqlite.exec(readFileSync(resolve(migrationsDir, '0001_initial_d1.sql'), 'utf-8'))
  sqlite.exec(readFileSync(resolve(migrationsDir, '0002_seed_initial.sql'), 'utf-8'))
  sqlite.exec(readFileSync(resolve(migrationsDir, '0004_monitor_cctv.sql'), 'utf-8'))

  const mockD1: any = {
    prepare(sql: string) {
      return {
        bind(...values: any[]) {
          return {
            async all() {
              const stmt = sqlite.prepare(sql)
              const results = stmt.all(...values)
              return { results, meta: { changes: 0 } }
            },
            async first(colName?: string) {
              const stmt = sqlite.prepare(sql)
              const row: any = stmt.get(...values)
              if (!row) return null
              return colName ? row[colName] : row
            },
            async run() {
              const stmt = sqlite.prepare(sql)
              const info = stmt.run(...values)
              return { meta: { changes: info.changes } }
            },
          }
        },
      }
    },
    async exec(sql: string) {
      sqlite.exec(sql)
    },
  }

  const r2 = createMockR2Bucket()

  const env = {
    DB: mockD1,
    IMAGES: r2,
    SESSION_SECRET: TEST_SESSION_SECRET,
    MONITOR_AGENT_KEY: TEST_AGENT_KEY,
  }

  const staffToken = await signSessionToken(
    {
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        username: 'toko',
        displayName: 'Pengelola Toko',
      },
      passwordChangedAt: new Date().toISOString(),
    },
    TEST_SESSION_SECRET,
  )

  const staffHeaders = {
    Cookie: `zaina_session=${staffToken}`,
  }

  const agentHeaders = {
    'X-Monitor-Agent-Key': TEST_AGENT_KEY,
  }

  return {
    r2,
    staffHeaders,
    agentHeaders,
    request: (path: string | URL | Request, init?: RequestInit) => {
      return app.request(path, init, env as any)
    },
    close: async () => {
      sqlite.close()
    },
  }
}

type MonitorTestContext = Awaited<ReturnType<typeof createMonitorTestContext>>

describe('monitor routes', () => {
  let ctx: MonitorTestContext

  beforeAll(async () => {
    ctx = await createMonitorTestContext()
  })

  afterAll(async () => {
    await ctx?.close()
  })

  it('rejects unauthenticated access to all staff routes with 401', async () => {
    const checks = [
      ctx.request('/api/v1/monitor/state'),
      ctx.request('/api/v1/monitor/door', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closed: true }),
      }),
      ctx.request('/api/v1/monitor/mode', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'serving' }),
      }),
      ctx.request('/api/v1/monitor/camera', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cam: 'cam1', active: false }),
      }),
      ctx.request('/api/v1/monitor/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamBaseUrl: 'https://cctv.example.com' }),
      }),
      ctx.request('/api/v1/monitor/frames/cam1'),
    ]

    const responses = await Promise.all(checks)
    for (const res of responses) {
      expect(res.status).toBe(401)
    }
  })

  it('rejects missing or invalid agent key with 401', async () => {
    const missingRes = await ctx.request('/api/v1/monitor/agent/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpu: 10, mem: 20, gpu: 0 }),
    })
    expect(missingRes.status).toBe(401)

    const wrongRes = await ctx.request('/api/v1/monitor/agent/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Monitor-Agent-Key': 'wrong-key',
      },
      body: JSON.stringify({ eventType: 'person_enter', cam: 'cam2' }),
    })
    expect(wrongRes.status).toBe(401)

    const wrongFrameRes = await ctx.request('/api/v1/monitor/agent/frame/cam1', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong-key',
      },
      body: new Uint8Array([0xff, 0xd8, 0xff]),
    })
    expect(wrongFrameRes.status).toBe(401)
  })

  it('allows staff to fetch initial state, toggle door closed, reject cam while closed, switch mode, and save streamBaseUrl', async () => {
    const initialRes = await ctx.request('/api/v1/monitor/state', {
      headers: ctx.staffHeaders,
    })
    expect(initialRes.status).toBe(200)
    expect(initialRes.headers.get('cache-control')).toBe('no-store')
    const initialBody = (await initialRes.json()) as any
    expect(initialBody.data).toMatchObject({
      opMode: 'watch',
      doorClosed: false,
      cam1Active: true,
      cam2Active: true,
      streamBaseUrl: null,
      agentOnline: false,
      todayVisitors: 0,
    })

    // Close door -> auto shuts off cam1 & cam2
    const closeDoorRes = await ctx.request('/api/v1/monitor/door', {
      method: 'PATCH',
      headers: {
        ...ctx.staffHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ closed: true }),
    })
    expect(closeDoorRes.status).toBe(200)
    const closeDoorBody = (await closeDoorRes.json()) as any
    expect(closeDoorBody.data.doorClosed).toBe(true)
    expect(closeDoorBody.data.cam1Active).toBe(false)
    expect(closeDoorBody.data.cam2Active).toBe(false)
    expect(closeDoorBody.data.recentEvents[0]).toMatchObject({
      eventType: 'state_change',
      label: 'Toko Tutup',
    })

    // Trying to turn camera on while closed returns 409 STORE_CLOSED
    const blockedCamRes = await ctx.request('/api/v1/monitor/camera', {
      method: 'PATCH',
      headers: {
        ...ctx.staffHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cam: 'cam1', active: true }),
    })
    expect(blockedCamRes.status).toBe(409)
    const blockedCamBody = (await blockedCamRes.json()) as any
    expect(blockedCamBody.error.code).toBe('STORE_CLOSED')

    // Re-open door and enable cam1
    const openDoorRes = await ctx.request('/api/v1/monitor/door', {
      method: 'PATCH',
      headers: {
        ...ctx.staffHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ closed: false }),
    })
    expect(openDoorRes.status).toBe(200)

    const enableCamRes = await ctx.request('/api/v1/monitor/camera', {
      method: 'PATCH',
      headers: {
        ...ctx.staffHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cam: 'cam1', active: true }),
    })
    expect(enableCamRes.status).toBe(200)
    const enableCamBody = (await enableCamRes.json()) as any
    expect(enableCamBody.data.cam1Active).toBe(true)
    expect(enableCamBody.data.cam2Active).toBe(false)

    // Switch mode to serving
    const modeRes = await ctx.request('/api/v1/monitor/mode', {
      method: 'PATCH',
      headers: {
        ...ctx.staffHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'serving' }),
    })
    expect(modeRes.status).toBe(200)
    const modeBody = (await modeRes.json()) as any
    expect(modeBody.data.opMode).toBe('serving')

    // Save streamBaseUrl
    const configRes = await ctx.request('/api/v1/monitor/config', {
      method: 'PATCH',
      headers: {
        ...ctx.staffHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ streamBaseUrl: 'https://stream.tokozaina.id' }),
    })
    expect(configRes.status).toBe(200)
    const configBody = (await configRes.json()) as any
    expect(configBody.data.streamBaseUrl).toBe('https://stream.tokozaina.id')
  })

  it('handles agent heartbeat, frame upload/retrieval, and visitor counting rules', async () => {
    // Heartbeat via X-Monitor-Agent-Key
    const hbRes = await ctx.request('/api/v1/monitor/agent/heartbeat', {
      method: 'POST',
      headers: {
        ...ctx.agentHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cpu: 31.4,
        mem: 54.2,
        gpu: 12.0,
        serverSpecs: {
          os: 'Ubuntu 24.04',
          arch: 'x64',
          cpu: 'Intel Core i5',
          cores: 4,
          ram: '16 GB',
        },
      }),
    })
    expect(hbRes.status).toBe(200)
    const hbBody = (await hbRes.json()) as any
    expect(hbBody.data.desiredState).toEqual({
      doorClosed: false,
      opMode: 'serving',
      cam1Active: true,
      cam2Active: false,
    })

    // Staff sees agentOnline: true and metrics/specs
    const stateRes = await ctx.request('/api/v1/monitor/state', {
      headers: ctx.staffHeaders,
    })
    expect(stateRes.status).toBe(200)
    const stateBody = (await stateRes.json()) as any
    expect(stateBody.data.agentOnline).toBe(true)
    expect(stateBody.data.hardware).toEqual({ cpu: 31.4, mem: 54.2, gpu: 12 })
    expect(stateBody.data.serverSpecs).toEqual({
      os: 'Ubuntu 24.04',
      arch: 'x64',
      cpu: 'Intel Core i5',
      cores: 4,
      ram: '16 GB',
    })

    // Missing frame returns 404 JSON
    const missingFrameRes = await ctx.request('/api/v1/monitor/frames/cam2', {
      headers: ctx.staffHeaders,
    })
    expect(missingFrameRes.status).toBe(404)
    const missingFrameBody = (await missingFrameRes.json()) as any
    expect(missingFrameBody.error.code).toBe('FRAME_NOT_FOUND')

    // Upload JPEG frame via Authorization: Bearer <key>
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    const uploadRes = await ctx.request('/api/v1/monitor/agent/frame/cam1', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_AGENT_KEY}`,
        'Content-Type': 'image/jpeg',
      },
      body: jpegBytes,
    })
    expect(uploadRes.status).toBe(200)
    const uploadBody = (await uploadRes.json()) as any
    expect(uploadBody.data).toEqual({ ok: true, cam: 'cam1', bytes: jpegBytes.byteLength })

    // Fetch uploaded frame as staff
    const fetchFrameRes = await ctx.request('/api/v1/monitor/frames/cam1', {
      headers: ctx.staffHeaders,
    })
    expect(fetchFrameRes.status).toBe(200)
    expect(fetchFrameRes.headers.get('content-type')).toBe('image/jpeg')
    expect(fetchFrameRes.headers.get('cache-control')).toBe('no-store')
    const fetchedBytes = new Uint8Array(await fetchFrameRes.arrayBuffer())
    expect(Array.from(fetchedBytes)).toEqual(Array.from(jpegBytes))

    // Agent person_enter on cam2 increments todayVisitors
    const enterCam2_1 = await ctx.request('/api/v1/monitor/agent/events', {
      method: 'POST',
      headers: {
        ...ctx.agentHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventType: 'person_enter', cam: 'cam2', trackId: 1 }),
    })
    expect(enterCam2_1.status).toBe(200)
    const enterCam2_1Body = (await enterCam2_1.json()) as any
    expect(enterCam2_1Body.data.todayVisitors).toBe(1)

    const enterCam2_2 = await ctx.request('/api/v1/monitor/agent/events', {
      method: 'POST',
      headers: {
        ...ctx.agentHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventType: 'person_enter', cam: 'cam2', trackId: 2 }),
    })
    expect(enterCam2_2.status).toBe(200)
    expect(((await enterCam2_2.json()) as any).data.todayVisitors).toBe(2)

    // person_enter on cam1 logs event WITHOUT incrementing todayVisitors
    const enterCam1 = await ctx.request('/api/v1/monitor/agent/events', {
      method: 'POST',
      headers: {
        ...ctx.agentHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventType: 'person_enter', cam: 'cam1', trackId: 9 }),
    })
    expect(enterCam1.status).toBe(200)
    const enterCam1Body = (await enterCam1.json()) as any
    expect(enterCam1Body.data.todayVisitors).toBe(2)
    expect(enterCam1Body.data.event).toMatchObject({
      eventType: 'person_enter',
      cameraId: 'cam1',
      label: 'Orang Masuk',
    })

    // person_exit on cam2 logs event WITHOUT incrementing todayVisitors
    const exitCam2 = await ctx.request('/api/v1/monitor/agent/events', {
      method: 'POST',
      headers: {
        ...ctx.agentHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventType: 'person_exit', cam: 'cam2', trackId: 2 }),
    })
    expect(exitCam2.status).toBe(200)
    expect(((await exitCam2.json()) as any).data.todayVisitors).toBe(2)
  })
})
