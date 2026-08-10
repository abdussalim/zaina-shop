import { randomUUID } from 'node:crypto'

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

  it('rejects unit identifiers owned by another product without changing the catalog', async () => {
    const first = await createProduct('UNIT-201')
    const second = await createProduct('UNIT-202')
    const update = productInput('UNIT-201')
    update.units[0]!.id = second.body.data.units[0].id
    update.units[1]!.id = first.body.data.units[1].id

    const response = await context.agent
      .patch(`/api/v1/products/${first.body.data.id}`)
      .set('Origin', testConfig.appOrigin)
      .send(update)

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('INVALID_PRODUCT_UNIT')
    const unchanged = await context.agent.get(`/api/v1/products/${first.body.data.id}`)
    expect(unchanged.body.data.units).toHaveLength(2)
  })

  it('rejects duplicate unit identifiers before mutating a product', async () => {
    const created = await createProduct('UNIT-203')
    const update = productInput('UNIT-203')
    const repeatedId = created.body.data.units[0].id
    update.units[0]!.id = repeatedId
    update.units[1]!.id = repeatedId

    const response = await context.agent
      .patch(`/api/v1/products/${created.body.data.id}`)
      .set('Origin', testConfig.appOrigin)
      .send(update)

    expect(response.status).toBe(422)
    const unchanged = await context.agent.get(`/api/v1/products/${created.body.data.id}`)
    expect(unchanged.body.data.units).toHaveLength(2)
  })

  it('refuses to archive a product while physical stock remains', async () => {
    const created = await createProduct('ARC-201')
    const baseUnit = created.body.data.units.find(
      (unit: { name: string }) => unit.name === 'buah',
    )
    await context.agent
      .post('/api/v1/inventory/movements')
      .set('Origin', testConfig.appOrigin)
      .send({
        idempotencyKey: randomUUID(),
        type: 'RECEIPT',
        productId: created.body.data.id,
        unitId: baseUnit.id,
        quantity: 1,
      })

    const response = await context.agent
      .post(`/api/v1/products/${created.body.data.id}/archive`)
      .set('Origin', testConfig.appOrigin)

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('PRODUCT_HAS_STOCK')
    const product = await context.agent.get(`/api/v1/products/${created.body.data.id}`)
    expect(product.body.data).toMatchObject({ isActive: true, balanceBase: 1 })
  })

  it('does not silently truncate a catalog larger than 250 products', async () => {
    await context.database.query(
      `INSERT INTO products (
         id, category_id, sku, name, base_unit, cost_price, sale_price, minimum_stock
       )
       SELECT ('50000000-0000-4000-8000-' || LPAD(number::text, 12, '0'))::uuid,
              $1, 'BULK-' || LPAD(number::text, 3, '0'),
              'Produk Massal ' || LPAD(number::text, 3, '0'),
              'buah', 1000, 2000, 1
       FROM generate_series(1, 251) AS number`,
      [categoryId],
    )
    await context.database.query(
      `INSERT INTO product_units (
         id, product_id, name, factor, sale_price, is_default
       )
       SELECT ('60000000-0000-4000-8000-' || LPAD(number::text, 12, '0'))::uuid,
              ('50000000-0000-4000-8000-' || LPAD(number::text, 12, '0'))::uuid,
              'buah', 1, 2000, TRUE
       FROM generate_series(1, 251) AS number`,
    )
    await context.database.query(
      `INSERT INTO inventory_balances (product_id, quantity_base)
       SELECT ('50000000-0000-4000-8000-' || LPAD(number::text, 12, '0'))::uuid, 1
       FROM generate_series(1, 251) AS number`,
    )

    const response = await context.agent.get('/api/v1/products?q=Produk%20Massal')

    expect(response.status).toBe(200)
    expect(response.body.data).toHaveLength(251)
  })
})
