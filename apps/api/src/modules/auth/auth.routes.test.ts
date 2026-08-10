import expressSession from 'express-session'
import request, { type SuperTest, type Test } from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../../app.js'
import type { AppConfig } from '../../config.js'
import type { Database } from '../../db/database.js'
import { runMigrations } from '../../db/migrate.js'
import { seedDatabase } from '../../db/seed.js'
import { createTestDatabase } from '../../db/test-database.js'

const config: AppConfig = {
  nodeEnv: 'test',
  port: 3000,
  appOrigin: 'http://localhost:8080',
  databaseUrl: 'postgresql://unused-in-tests',
  sessionSecret: '12345678901234567890123456789012',
  adminUsername: 'toko',
  adminPassword: 'rahasia-yang-kuat',
  storeName: 'Toko Zaina',
  storeTimezone: 'Asia/Jakarta',
  seedDemoData: false,
  isProduction: false,
}

describe('authentication routes', () => {
  let database: Database
  let client: SuperTest<Test>

  beforeAll(async () => {
    database = await createTestDatabase()
    await runMigrations(database)
    await seedDatabase(database, {
      adminUsername: config.adminUsername,
      adminPassword: config.adminPassword,
      storeName: config.storeName,
      storeTimezone: config.storeTimezone,
      seedDemoData: false,
    })
  })

  beforeEach(() => {
    const app = createApp({
      config,
      database,
      sessionStore: new expressSession.MemoryStore(),
    })
    client = request(app)
  })

  afterAll(async () => {
    await database.close()
  })

  it('exposes a database-backed health check with a request id', async () => {
    const response = await client.get('/api/v1/health')

    expect(response.status).toBe(200)
    expect(response.headers['x-request-id']).toBeTypeOf('string')
    expect(response.body.data).toEqual({ status: 'ok' })
  })

  it('returns the shared error contract for an unauthenticated session', async () => {
    const response = await client.get('/api/v1/auth/session')

    expect(response.status).toBe(401)
    expect(response.body.error).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Silakan masuk terlebih dahulu',
    })
    expect(response.body.error.requestId).toBeTypeOf('string')
  })

  it('logs in, restores the session, and logs out', async () => {
    const agent = request.agent(
      createApp({
        config,
        database,
        sessionStore: new expressSession.MemoryStore(),
      }),
    )

    const login = await agent
      .post('/api/v1/auth/login')
      .set('Origin', config.appOrigin)
      .send({ username: 'toko', password: 'rahasia-yang-kuat' })
    expect(login.status).toBe(200)
    expect(login.body.data).toMatchObject({
      username: 'toko',
      displayName: 'Pengelola Toko',
    })

    const session = await agent.get('/api/v1/auth/session')
    expect(session.status).toBe(200)
    expect(session.body.data.username).toBe('toko')

    const logout = await agent
      .post('/api/v1/auth/logout')
      .set('Origin', config.appOrigin)
    expect(logout.status).toBe(204)
    expect((await agent.get('/api/v1/auth/session')).status).toBe(401)
  })

  it('uses one generic error for invalid credentials', async () => {
    const response = await client
      .post('/api/v1/auth/login')
      .set('Origin', config.appOrigin)
      .send({ username: 'toko', password: 'kata-sandi-salah' })

    expect(response.status).toBe(401)
    expect(response.body.error.message).toBe('Nama pengguna atau kata sandi salah')
  })

  it('rejects unsafe requests from another origin', async () => {
    const response = await client
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ username: 'toko', password: 'rahasia-yang-kuat' })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('UNTRUSTED_ORIGIN')
  })

  it('maps malformed and oversized JSON to stable client errors', async () => {
    const malformed = await client
      .post('/api/v1/auth/login')
      .set('Origin', config.appOrigin)
      .set('Content-Type', 'application/json')
      .send('{"username":')
    expect(malformed.status).toBe(400)
    expect(malformed.body.error.code).toBe('INVALID_JSON')

    const oversized = await client
      .post('/api/v1/auth/login')
      .set('Origin', config.appOrigin)
      .send({ username: 'toko', password: 'x'.repeat(1_100_000) })
    expect(oversized.status).toBe(413)
    expect(oversized.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('keeps login rate-limit buckets separate behind the documented proxy chain', async () => {
    const productionConfig: AppConfig = {
      ...config,
      appOrigin: 'https://inventaris.example.com',
      isProduction: true,
    }
    const productionClient = request(
      createApp({
        config: productionConfig,
        database,
        sessionStore: new expressSession.MemoryStore(),
      }),
    )
    const attempt = (clientIp: string) =>
      productionClient
        .post('/api/v1/auth/login')
        .set('Origin', productionConfig.appOrigin)
        .set('X-Forwarded-Proto', 'https')
        .set('X-Forwarded-For', `${clientIp}, 172.18.0.1`)
        .send({ username: 'tidak-ada', password: 'kata-sandi-salah' })

    for (let index = 0; index < 10; index += 1) {
      expect((await attempt('203.0.113.10')).status).toBe(401)
    }

    const limited = await attempt('203.0.113.10')
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('LOGIN_RATE_LIMITED')

    expect((await attempt('198.51.100.20')).status).toBe(401)
  })
})
