import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import app from '../../index.js'

export async function createAnonymousTestContext() {
  const sqlite = new DatabaseSync(':memory:')

  const migrationsDir = fileURLToPath(new URL('../../../../../migrations', import.meta.url))
  const migration1 = readFileSync(resolve(migrationsDir, '0001_initial_d1.sql'), 'utf-8')
  const migration2 = readFileSync(resolve(migrationsDir, '0002_seed_initial.sql'), 'utf-8')
  sqlite.exec(migration1)
  sqlite.exec(migration2)

  // Seed sample product for catalog testing
  sqlite.exec(`
    INSERT INTO products (
      id, category_id, sku, barcode, name, location, base_unit,
      cost_price, sale_price, minimum_stock, image_url, is_active
    ) VALUES (
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'SKU-TEST-01',
      '899123456789',
      'Piring Keramik 8 Inch',
      'Rak A1',
      'buah',
      5000,
      10000,
      5,
      'https://example.com/piring.jpg',
      1
    );

    INSERT INTO product_units (
      id, product_id, name, factor, sale_price,
      discount_type, minimum_discount, maximum_discount, is_default, is_active
    ) VALUES (
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'buah',
      1,
      10000,
      'PERCENTAGE',
      0,
      0,
      1,
      1
    );

    INSERT INTO inventory_balances (
      product_id, quantity_base, updated_at
    ) VALUES (
      '20000000-0000-4000-8000-000000000001',
      20,
      datetime('now')
    );
  `)

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

  const env = { DB: mockD1 }

  return {
    app: {
      request: (path: string | URL | Request, init?: RequestInit) => {
        return app.request(path, init, env)
      },
    },
    close: async () => {
      sqlite.close()
    },
  }
}

type AnonymousTestContext = Awaited<ReturnType<typeof createAnonymousTestContext>>

describe('storefront public routes', () => {
  let context: AnonymousTestContext

  beforeAll(async () => {
    context = await createAnonymousTestContext()
  })

  afterAll(async () => {
    await context?.close()
  })

  it('allows unauthenticated access to store info', async () => {
    const response = await context.app.request('/api/v1/storefront/info')
    expect(response.status).toBe(200)

    const body = (await response.json()) as any
    expect(body.data).toHaveProperty('storeName')
    expect(body.data).toHaveProperty('phone')
  })

  it('allows unauthenticated access to public catalog without exposing cost price', async () => {
    const response = await context.app.request('/api/v1/storefront/catalog')
    expect(response.status).toBe(200)

    const body = (await response.json()) as any
    expect(Array.isArray(body.data.categories)).toBe(true)
    expect(Array.isArray(body.data.products)).toBe(true)

    if (body.data.products.length > 0) {
      const product = body.data.products[0]
      expect(product).toHaveProperty('id')
      expect(product).toHaveProperty('name')
      expect(product).toHaveProperty('units')
      expect(product).toHaveProperty('stockStatus')
      expect(product).not.toHaveProperty('costPrice')
      expect(product).not.toHaveProperty('cost_price')
    }
  })
})
