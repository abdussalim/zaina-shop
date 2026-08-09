import session from 'express-session'
import request from 'supertest'

import { createApp } from '../app.js'
import type { AppConfig } from '../config.js'
import type { Database } from '../db/database.js'
import { runMigrations } from '../db/migrate.js'
import { seedDatabase } from '../db/seed.js'
import { createTestDatabase } from '../db/test-database.js'

export const testConfig: AppConfig = {
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

export async function createAuthenticatedTestContext(options?: {
  seedDemoData?: boolean
}) {
  const database: Database = await createTestDatabase()
  await runMigrations(database)
  await seedDatabase(database, {
    adminUsername: testConfig.adminUsername,
    adminPassword: testConfig.adminPassword,
    storeName: testConfig.storeName,
    storeTimezone: testConfig.storeTimezone,
    seedDemoData: options?.seedDemoData ?? false,
  })

  const app = createApp({
    config: testConfig,
    database,
    sessionStore: new session.MemoryStore(),
  })
  const agent = request.agent(app)
  const login = await agent
    .post('/api/v1/auth/login')
    .set('Origin', testConfig.appOrigin)
    .send({
      username: testConfig.adminUsername,
      password: testConfig.adminPassword,
    })
  if (login.status !== 200) throw new Error('Test login failed')

  return {
    agent,
    database,
    close: () => database.close(),
  }
}
