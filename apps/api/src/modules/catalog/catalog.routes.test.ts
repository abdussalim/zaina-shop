import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createAuthenticatedTestContext, testConfig } from '../../test/app-context.js'

type TestContext = Awaited<ReturnType<typeof createAuthenticatedTestContext>>

describe('catalog routes', () => {
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

  function productInput(sku: string, name = 'Piring Kaca Bening') {
    return {
      sku,
      barcode: '',
      name,
      categoryId,
      location: 'Rak A1',
      baseUnit: 'buah',
      costPrice: 7_000,
      salePrice: 10_000,
      minimumStock: 12,
      imageUrl: '',
      units: [
        { name: 'buah', factor: 1, salePrice: 10_000, isDefault: true },
        { name: 'lusin', factor: 12, salePrice: 115_000, isDefault: false },
      ],
    }
  }

  async function createProduct(sku: string, name?: string) {
    return context.agent
      .post('/api/v1/products')
      .set('Origin', testConfig.appOrigin)
      .send(productInput(sku, name))
  }

  it('lists the seeded product categories', async () => {
    const response = await context.agent.get('/api/v1/categories')

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Pecah Belah' })]),
    )
  })

  it('creates a product with a zero balance and converted selling units', async () => {
    const response = await createProduct('PRG-101')

    expect(response.status).toBe(201)
    expect(response.body.data).toMatchObject({
      sku: 'PRG-101',
      balanceBase: 0,
      stockStatus: 'OUT_OF_STOCK',
    })
    expect(response.body.data.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'buah', factor: 1 }),
        expect.objectContaining({ name: 'lusin', factor: 12 }),
      ]),
    )
  })

  it('returns a stable conflict error for duplicate SKU values', async () => {
    expect((await createProduct('DUP-101')).status).toBe(201)

    const duplicate = await createProduct('dup-101', 'Produk Lain')

    expect(duplicate.status).toBe(409)
    expect(duplicate.body.error.code).toBe('DUPLICATE_PRODUCT_CODE')
  })

  it('searches products and excludes archived products by default', async () => {
    const created = await createProduct('MGK-101', 'Mangkok Keramik Biru')
    const productId = created.body.data.id

    const search = await context.agent.get('/api/v1/products?q=mangkok')
    expect(search.body.data.map((product: { id: string }) => product.id)).toContain(
      productId,
    )

    const archived = await context.agent
      .post(`/api/v1/products/${productId}/archive`)
      .set('Origin', testConfig.appOrigin)
    expect(archived.status).toBe(200)

    const activeOnly = await context.agent.get('/api/v1/products?q=mangkok')
    expect(activeOnly.body.data).toHaveLength(0)
    const all = await context.agent.get(
      '/api/v1/products?q=mangkok&includeInactive=true',
    )
    expect(all.body.data[0]).toMatchObject({ id: productId, isActive: false })
  })

  it('updates catalog prices without changing the stock balance', async () => {
    const created = await createProduct('UPD-101')
    const update = productInput('UPD-101', 'Piring Kaca Premium')
    update.salePrice = 12_000
    update.units[0]!.salePrice = 12_000

    const response = await context.agent
      .patch(`/api/v1/products/${created.body.data.id}`)
      .set('Origin', testConfig.appOrigin)
      .send(update)

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      name: 'Piring Kaca Premium',
      salePrice: 12_000,
      balanceBase: 0,
    })
  })

  it('archives removed selling units without exposing them to new sales', async () => {
    const created = await createProduct('UNIT-101')
    const update = productInput('UNIT-101')
    update.units = [update.units[0]!]

    const response = await context.agent
      .patch(`/api/v1/products/${created.body.data.id}`)
      .set('Origin', testConfig.appOrigin)
      .send(update)

    expect(response.status).toBe(200)
    expect(response.body.data.units.map((unit: { name: string }) => unit.name)).toEqual([
      'buah',
    ])
  })
})
