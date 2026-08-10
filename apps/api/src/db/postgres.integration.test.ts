import { randomUUID } from 'node:crypto'

import connectPgSimple from 'connect-pg-simple'
import session from 'express-session'
import { Pool } from 'pg'
import request, { type SuperAgentTest } from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../app.js'
import type { AppConfig } from '../config.js'
import { testConfig } from '../test/app-context.js'
import { createPostgresDatabase, type Database } from './database.js'
import { runMigrations } from './migrate.js'
import { seedDatabase } from './seed.js'

const baseDatabaseUrl = process.env.TEST_DATABASE_URL
const describePostgres = baseDatabaseUrl ? describe : describe.skip
const PgSessionStore = connectPgSimple(session)

describePostgres('PostgreSQL integration', () => {
  const schema = `zaina_test_${randomUUID().replaceAll('-', '')}`
  let adminPool: Pool | undefined
  let database: Database | undefined
  let sessionStore: InstanceType<typeof PgSessionStore> | undefined
  let config: AppConfig
  let firstAgent: SuperAgentTest
  let secondAgent: SuperAgentTest

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: baseDatabaseUrl! })
    await adminPool.query(`CREATE SCHEMA "${schema}"`)

    const scopedUrl = new URL(baseDatabaseUrl!)
    scopedUrl.searchParams.set('options', `-csearch_path=${schema}`)
    config = { ...testConfig, databaseUrl: scopedUrl.toString() }
    database = createPostgresDatabase(config.databaseUrl)
    await runMigrations(database)
    await seedDatabase(database, {
      adminUsername: config.adminUsername,
      adminPassword: config.adminPassword,
      storeName: config.storeName,
      storeTimezone: config.storeTimezone,
      seedDemoData: false,
    })

    sessionStore = new PgSessionStore({
      conString: config.databaseUrl,
      tableName: 'session',
      createTableIfMissing: false,
      pruneSessionInterval: false,
    })
    const app = createApp({ config, database, sessionStore })
    firstAgent = request.agent(app)
    secondAgent = request.agent(app)

    await Promise.all([login(firstAgent, config), login(secondAgent, config)])
  }, 120_000)

  afterAll(async () => {
    try {
      if (sessionStore) await Promise.resolve(sessionStore.close())
    } finally {
      try {
        await database?.close()
      } finally {
        if (adminPool) {
          try {
            await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
          } finally {
            await adminPool.end()
          }
        }
      }
    }
  })

  it('persists separate sessions and prevents concurrent overselling', async () => {
    const sessions = await database!.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM session',
    )
    expect(Number(sessions.rows[0]!.count)).toBe(2)

    const categories = await firstAgent.get('/api/v1/categories')
    const categoryId = categories.body.data[0].id as string
    const created = await firstAgent
      .post('/api/v1/products')
      .set('Origin', config.appOrigin)
      .send({
        sku: `PG-${randomUUID().slice(0, 8)}`,
        name: 'Barang Uji Konkurensi PostgreSQL',
        categoryId,
        baseUnit: 'buah',
        costPrice: 7_000,
        salePrice: 10_000,
        minimumStock: 1,
        units: [
          { name: 'buah', factor: 1, salePrice: 10_000, isDefault: true },
        ],
      })
    expect(created.status).toBe(201)
    const productId = created.body.data.id as string
    const unitId = created.body.data.units[0].id as string

    const receipt = await firstAgent
      .post('/api/v1/inventory/movements')
      .set('Origin', config.appOrigin)
      .send({
        idempotencyKey: randomUUID(),
        type: 'RECEIPT',
        productId,
        unitId,
        quantity: 1,
        unitCost: 7_000,
        note: 'Stok tunggal untuk uji konkurensi',
      })
    expect(receipt.status).toBe(201)

    const sell = (agent: SuperAgentTest) =>
      agent
        .post('/api/v1/sales')
        .set('Origin', config.appOrigin)
        .send({
          idempotencyKey: randomUUID(),
          discount: 0,
          amountPaid: 10_000,
          items: [{ productId, unitId, quantity: 1 }],
        })
    const responses = await Promise.all([sell(firstAgent), sell(secondAgent)])
    const orderedStatuses = responses.map((response) => response.status).sort()
    expect(orderedStatuses).toEqual([201, 409])
    expect(responses.find((response) => response.status === 409)?.body.error.code).toBe(
      'INSUFFICIENT_STOCK',
    )

    const balance = await database!.query<{ quantityBase: string }>(
      `SELECT quantity_base AS "quantityBase"
       FROM inventory_balances
       WHERE product_id = $1`,
      [productId],
    )
    const sales = await database!.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM sale_items
       WHERE product_id = $1`,
      [productId],
    )
    expect(Number(balance.rows[0]!.quantityBase)).toBe(0)
    expect(Number(sales.rows[0]!.count)).toBe(1)
  }, 120_000)
})

async function login(agent: SuperAgentTest, config: AppConfig): Promise<void> {
  const response = await agent
    .post('/api/v1/auth/login')
    .set('Origin', config.appOrigin)
    .send({ username: config.adminUsername, password: config.adminPassword })
  expect(response.status).toBe(200)
}
