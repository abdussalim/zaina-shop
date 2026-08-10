import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

import { createAuthenticatedTestContext, testConfig } from '../../test/app-context.js'

type TestContext = Awaited<ReturnType<typeof createAuthenticatedTestContext>>

describe('settings routes', () => {
  let context: TestContext

  beforeAll(async () => {
    context = await createAuthenticatedTestContext()
  })

  afterAll(async () => {
    await context?.close()
  })

  it('reads and updates the singleton store identity', async () => {
    const initial = await context.agent.get('/api/v1/settings/store')
    expect(initial.status).toBe(200)
    expect(initial.body.data.storeName).toBe('Toko Zaina')

    const updated = await context.agent
      .patch('/api/v1/settings/store')
      .set('Origin', testConfig.appOrigin)
      .send({
        storeName: 'Toko Zaina Kapuas',
        address: 'Jl. Trans Kalimantan',
        phone: '081234567890',
        timezone: 'Asia/Jakarta',
        defaultMinimumStock: 6,
      })
    expect(updated.status).toBe(200)
    expect(updated.body.data).toMatchObject({
      storeName: 'Toko Zaina Kapuas',
      defaultMinimumStock: 6,
    })
  })

  it('requires the current password before changing the shared password', async () => {
    const secondSession = request.agent(context.app)
    expect(
      (
        await secondSession
          .post('/api/v1/auth/login')
          .set('Origin', testConfig.appOrigin)
          .send({
            username: testConfig.adminUsername,
            password: testConfig.adminPassword,
          })
      ).status,
    ).toBe(200)

    const rejected = await context.agent
      .post('/api/v1/settings/password')
      .set('Origin', testConfig.appOrigin)
      .send({ currentPassword: 'salah-sekali', newPassword: 'kata-sandi-baru-yang-kuat' })
    expect(rejected.status).toBe(401)
    expect(rejected.body.error.code).toBe('INVALID_CURRENT_PASSWORD')

    const changed = await context.agent
      .post('/api/v1/settings/password')
      .set('Origin', testConfig.appOrigin)
      .send({
        currentPassword: testConfig.adminPassword,
        newPassword: 'kata-sandi-baru-yang-kuat',
      })
    expect(changed.status).toBe(204)

    expect((await context.agent.get('/api/v1/auth/session')).status).toBe(401)
    expect((await secondSession.get('/api/v1/auth/session')).status).toBe(401)
    const login = await context.agent
      .post('/api/v1/auth/login')
      .set('Origin', testConfig.appOrigin)
      .send({ username: testConfig.adminUsername, password: 'kata-sandi-baru-yang-kuat' })
    expect(login.status).toBe(200)
  })
})
