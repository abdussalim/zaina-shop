import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createAuthenticatedTestContext, testConfig } from '../../test/app-context.js'

type TestContext = Awaited<ReturnType<typeof createAuthenticatedTestContext>>

describe('inventory routes', () => {
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

  async function createProduct(sku: string) {
    const response = await context.agent
      .post('/api/v1/products')
      .set('Origin', testConfig.appOrigin)
      .send({
        sku,
        name: `Produk ${sku}`,
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
    expect(response.status).toBe(201)
    return response.body.data as {
      id: string
      units: { id: string; name: string }[]
    }
  }

  it('receives a dozen and records two damaged pieces in one audit trail', async () => {
    const product = await createProduct('INV-101')
    const dozen = product.units.find((unit) => unit.name === 'lusin')!
    const piece = product.units.find((unit) => unit.name === 'buah')!

    const receipt = await context.agent
      .post('/api/v1/inventory/movements')
      .set('Origin', testConfig.appOrigin)
      .send({
        idempotencyKey: randomUUID(),
        type: 'RECEIPT',
        productId: product.id,
        unitId: dozen.id,
        quantity: 1,
        unitCost: 84_000,
        note: 'Pembelian awal',
      })
    expect(receipt.status).toBe(201)
    expect(receipt.body.data).toMatchObject({ quantityBase: 12, newBalance: 12 })

    const damage = await context.agent
      .post('/api/v1/inventory/movements')
      .set('Origin', testConfig.appOrigin)
      .send({
        idempotencyKey: randomUUID(),
        type: 'DAMAGE',
        productId: product.id,
        unitId: piece.id,
        quantity: 2,
        note: 'Pecah saat bongkar',
      })
    expect(damage.status).toBe(201)
    expect(damage.body.data).toMatchObject({ quantityBase: -2, newBalance: 10 })

    const detail = await context.agent.get(`/api/v1/products/${product.id}`)
    expect(detail.body.data).toMatchObject({ balanceBase: 10, costPrice: 7_000 })

    const history = await context.agent.get(
      `/api/v1/inventory/movements?productId=${product.id}`,
    )
    expect(history.body.data.map((movement: { type: string }) => movement.type)).toEqual([
      'DAMAGE',
      'RECEIPT',
    ])
  })

  it('rejects an outgoing movement that would create negative stock', async () => {
    const product = await createProduct('INV-102')
    const piece = product.units.find((unit) => unit.name === 'buah')!

    const response = await context.agent
      .post('/api/v1/inventory/movements')
      .set('Origin', testConfig.appOrigin)
      .send({
        idempotencyKey: randomUUID(),
        type: 'DAMAGE',
        productId: product.id,
        unitId: piece.id,
        quantity: 1,
        note: 'Pecah',
      })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK')
  })

  it('returns the original movement when an idempotency key is reused', async () => {
    const product = await createProduct('INV-103')
    const dozen = product.units.find((unit) => unit.name === 'lusin')!
    const idempotencyKey = randomUUID()
    const input = {
      idempotencyKey,
      type: 'RECEIPT',
      productId: product.id,
      unitId: dozen.id,
      quantity: 1,
      unitCost: 84_000,
      note: 'Pembelian idempotent',
    }

    const first = await context.agent
      .post('/api/v1/inventory/movements')
      .set('Origin', testConfig.appOrigin)
      .send(input)
    const repeated = await context.agent
      .post('/api/v1/inventory/movements')
      .set('Origin', testConfig.appOrigin)
      .send(input)
    const detail = await context.agent.get(`/api/v1/products/${product.id}`)

    expect(first.status).toBe(201)
    expect(repeated.status).toBe(200)
    expect(repeated.body.data.id).toBe(first.body.data.id)
    expect(detail.body.data.balanceBase).toBe(12)
  })

  it('summarizes stock value and availability', async () => {
    const response = await context.agent.get('/api/v1/inventory/summary')

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      totalProducts: expect.any(Number),
      inventoryValue: expect.any(Number),
      lowStockCount: expect.any(Number),
      outOfStockCount: expect.any(Number),
    })
  })
})
