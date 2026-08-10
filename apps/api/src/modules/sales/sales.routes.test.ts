import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createAuthenticatedTestContext, testConfig } from '../../test/app-context.js'

type TestContext = Awaited<ReturnType<typeof createAuthenticatedTestContext>>

describe('sales routes', () => {
  let context: TestContext
  let categoryId: string

  beforeAll(async () => {
    context = await createAuthenticatedTestContext()
    const categories = await context.database.query<{ id: string }>(
      'SELECT id FROM categories ORDER BY name LIMIT 1',
    )
    categoryId = categories.rows[0]!.id
  })

  afterAll(async () => {
    await context?.close()
  })

  async function createStockedProduct(sku: string, dozens: number) {
    const productResponse = await context.agent
      .post('/api/v1/products')
      .set('Origin', testConfig.appOrigin)
      .send({
        sku,
        name: `Piring ${sku}`,
        categoryId,
        baseUnit: 'buah',
        costPrice: 7_000,
        salePrice: 10_000,
        minimumStock: 3,
        units: [
          { name: 'buah', factor: 1, salePrice: 10_000, isDefault: true },
          { name: 'lusin', factor: 12, salePrice: 115_000, isDefault: false },
        ],
      })
    expect(productResponse.status).toBe(201)
    const product = productResponse.body.data as {
      id: string
      units: { id: string; name: string }[]
    }
    const dozen = product.units.find((unit) => unit.name === 'lusin')!
    const piece = product.units.find((unit) => unit.name === 'buah')!

    if (dozens > 0) {
      const receipt = await context.agent
        .post('/api/v1/inventory/movements')
        .set('Origin', testConfig.appOrigin)
        .send({
          idempotencyKey: randomUUID(),
          type: 'RECEIPT',
          productId: product.id,
          unitId: dozen.id,
          quantity: dozens,
          unitCost: 84_000,
          note: 'Stok untuk uji penjualan',
        })
      expect(receipt.status).toBe(201)
    }
    return { ...product, dozen, piece }
  }

  it('completes a dozen sale atomically and safely replays a duplicate request', async () => {
    const product = await createStockedProduct('SALE-101', 1)
    const input = {
      idempotencyKey: randomUUID(),
      discount: 5_000,
      amountPaid: 120_000,
      items: [{ productId: product.id, unitId: product.dozen.id, quantity: 1 }],
    }

    const first = await context.agent
      .post('/api/v1/sales')
      .set('Origin', testConfig.appOrigin)
      .send(input)
    const replay = await context.agent
      .post('/api/v1/sales')
      .set('Origin', testConfig.appOrigin)
      .send(input)
    const detail = await context.agent.get(`/api/v1/products/${product.id}`)

    expect(first.status).toBe(201)
    expect(first.body.data).toMatchObject({
      subtotal: 115_000,
      discount: 5_000,
      total: 110_000,
      amountPaid: 120_000,
      changeAmount: 10_000,
      status: 'COMPLETED',
    })
    expect(first.body.data.items[0]).toMatchObject({
      factorSnapshot: 12,
      quantityBase: 12,
      unitPrice: 115_000,
      costPrice: 7_000,
    })
    expect(replay.status).toBe(200)
    expect(replay.body.data.id).toBe(first.body.data.id)
    expect(detail.body.data.balanceBase).toBe(0)
  })

  it('rejects a sale without enough stock and leaves no partial transaction', async () => {
    const product = await createStockedProduct('SALE-102', 0)
    const idempotencyKey = randomUUID()
    const response = await context.agent
      .post('/api/v1/sales')
      .set('Origin', testConfig.appOrigin)
      .send({
        idempotencyKey,
        discount: 0,
        amountPaid: 115_000,
        items: [{ productId: product.id, unitId: product.dozen.id, quantity: 1 }],
      })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK')
    const count = await context.database.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM sales WHERE idempotency_key = $1`,
      [idempotencyKey],
    )
    expect(Number(count.rows[0]!.count)).toBe(0)
  })

  it('cancels a completed sale once and restores its stock', async () => {
    const product = await createStockedProduct('SALE-103', 1)
    const saleResponse = await context.agent
      .post('/api/v1/sales')
      .set('Origin', testConfig.appOrigin)
      .send({
        idempotencyKey: randomUUID(),
        discount: 0,
        amountPaid: 115_000,
        items: [{ productId: product.id, unitId: product.dozen.id, quantity: 1 }],
      })
    const saleId = saleResponse.body.data.id as string
    const archive = await context.agent
      .post(`/api/v1/products/${product.id}/archive`)
      .set('Origin', testConfig.appOrigin)
    expect(archive.status).toBe(200)

    const cancellation = await context.agent
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Origin', testConfig.appOrigin)
      .send({ reason: 'Pelanggan mengembalikan barang' })
    const repeated = await context.agent
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Origin', testConfig.appOrigin)
      .send({ reason: 'Coba lagi' })
    const detail = await context.agent.get(`/api/v1/products/${product.id}`)

    expect(cancellation.status).toBe(200)
    expect(cancellation.body.data.status).toBe('CANCELLED')
    expect(repeated.status).toBe(409)
    expect(repeated.body.error.code).toBe('SALE_ALREADY_CANCELLED')
    expect(detail.body.data).toMatchObject({ balanceBase: 12, isActive: true })
  })

  it('lists sales and retrieves a receipt by id', async () => {
    const list = await context.agent.get('/api/v1/sales')
    expect(list.status).toBe(200)
    expect(list.body.data.length).toBeGreaterThan(0)

    const detail = await context.agent.get(`/api/v1/sales/${list.body.data[0].id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.items).toEqual(expect.any(Array))
  })

  it('uses strict calendar dates and the store timezone when listing sales', async () => {
    expect((await context.agent.get('/api/v1/sales?from=2026-02-30')).status).toBe(422)
    expect(
      (await context.agent.get('/api/v1/sales?from=2026-03-02&to=2026-03-01')).status,
    ).toBe(422)

    const product = await createStockedProduct('SALE-104', 1)
    const sale = await context.agent
      .post('/api/v1/sales')
      .set('Origin', testConfig.appOrigin)
      .send({
        idempotencyKey: randomUUID(),
        discount: 0,
        amountPaid: 10_000,
        items: [{ productId: product.id, unitId: product.piece.id, quantity: 1 }],
      })
    await context.database.query(
      `UPDATE store_settings SET timezone = 'America/Los_Angeles' WHERE id = 1`,
    )
    await context.database.query(
      `UPDATE sales SET sold_at = '2026-01-01T00:30:00.000Z' WHERE id = $1`,
      [sale.body.data.id],
    )

    const listed = await context.agent.get(
      '/api/v1/sales?from=2025-12-31&to=2025-12-31',
    )

    expect(listed.status).toBe(200)
    expect(listed.body.data.map((item: { id: string }) => item.id)).toContain(
      sale.body.data.id,
    )
    await context.database.query(
      `UPDATE store_settings SET timezone = 'Asia/Jakarta' WHERE id = 1`,
    )
  })

  it('uses the timezone saved in store settings for sale numbers', async () => {
    const now = new Date()
    const fallbackDate = dateStamp(now, 'Asia/Jakarta')
    const timezone = ['Pacific/Honolulu', 'Pacific/Kiritimati'].find(
      (candidate) => dateStamp(now, candidate) !== fallbackDate,
    )!
    const product = await createStockedProduct('SALE-TZ', 1)
    await context.database.query('UPDATE store_settings SET timezone = $1 WHERE id = 1', [
      timezone,
    ])

    const response = await context.agent
      .post('/api/v1/sales')
      .set('Origin', testConfig.appOrigin)
      .send({
        idempotencyKey: randomUUID(),
        discount: 0,
        amountPaid: 115_000,
        items: [{ productId: product.id, unitId: product.dozen.id, quantity: 1 }],
      })

    await context.database.query(
      `UPDATE store_settings SET timezone = 'Asia/Jakarta' WHERE id = 1`,
    )
    expect(response.status).toBe(201)
    expect(response.body.data.saleNumber).toMatch(
      new RegExp(`^PJ-${dateStamp(now, timezone)}-`),
    )
  })
})

function dateStamp(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replaceAll('-', '')
}
