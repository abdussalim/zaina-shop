import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createAuthenticatedTestContext, testConfig } from '../../test/app-context.js'

type TestContext = Awaited<ReturnType<typeof createAuthenticatedTestContext>>

describe('dashboard and report routes', () => {
  let context: TestContext

  beforeAll(async () => {
    context = await createAuthenticatedTestContext({ seedDemoData: true })
    const product = await context.database.query<{ id: string; unit_id: string }>(
      `SELECT p.id, u.id AS unit_id
       FROM products p
       JOIN product_units u ON u.product_id = p.id AND u.is_default = TRUE
       WHERE p.sku = 'PRG-001'`,
    )
    const row = product.rows[0]!
    const sale = await context.agent
      .post('/api/v1/sales')
      .set('Origin', testConfig.appOrigin)
      .send({
        idempotencyKey: randomUUID(),
        amountPaid: 20_000,
        items: [
          {
            productId: row.id,
            unitId: row.unit_id,
            quantity: 2,
            discountValue: 5,
          },
        ],
      })
    expect(sale.status).toBe(201)
  })

  afterAll(async () => {
    await context?.close()
  })

  it('returns operational dashboard cards and activity lists', async () => {
    const response = await context.agent.get('/api/v1/dashboard')

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      salesToday: 1,
      revenueToday: 19_000,
      inventoryValue: expect.any(Number),
      lowStockCount: expect.any(Number),
      recentSales: expect.any(Array),
      recentMovements: expect.any(Array),
      lowStockProducts: expect.any(Array),
    })
  })

  it('reports sales, profit, top products, and current inventory value', async () => {
    const sales = await context.agent.get('/api/v1/reports/sales')
    const inventory = await context.agent.get('/api/v1/reports/inventory')

    expect(sales.status).toBe(200)
    expect(sales.body.data.summary).toMatchObject({
      transactionCount: 1,
      grossSales: 20_000,
      discounts: 1_000,
      netSales: 19_000,
      costOfGoods: 14_000,
      grossProfit: 5_000,
    })
    expect(sales.body.data.topProducts[0]).toMatchObject({
      productName: 'Piring Kaca Bening',
      quantityBase: 2,
      revenue: 19_000,
      cost: 14_000,
      grossProfit: 5_000,
    })
    expect(inventory.status).toBe(200)
    expect(inventory.body.data.summary.inventoryValue).toBeGreaterThan(0)
    expect(inventory.body.data.products).toEqual(expect.any(Array))
  })

  it('uses the timezone saved in store settings for date filters', async () => {
    await context.database.query(
      `UPDATE store_settings SET timezone = 'America/Los_Angeles' WHERE id = 1`,
    )
    await context.database.query(
      `UPDATE sales SET sold_at = '2026-01-01T00:30:00.000Z' WHERE status = 'COMPLETED'`,
    )

    const response = await context.agent.get(
      '/api/v1/reports/sales?from=2025-12-31&to=2025-12-31',
    )

    expect(response.status).toBe(200)
    expect(response.body.data.summary.transactionCount).toBe(1)

    await context.database.query(
      `UPDATE store_settings SET timezone = 'Asia/Jakarta' WHERE id = 1`,
    )
  })

  it('exports spreadsheet-safe CSV files', async () => {
    await context.database.query(
      `UPDATE products SET name = '=2+2' WHERE sku = 'PRG-001'`,
    )
    const response = await context.agent.get('/api/v1/reports/inventory?format=csv')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.headers['content-disposition']).toContain('attachment')
    expect(response.text).toContain("'=2+2")
  })

  it('returns and exports every transaction beyond the former 500-row boundary', async () => {
    const user = await context.database.query<{ id: string }>(
      'SELECT id FROM users ORDER BY created_at LIMIT 1',
    )
    await context.database.query(
      `INSERT INTO sales (
         id, sale_number, idempotency_key, sold_at, subtotal, discount, total,
         amount_paid, change_amount, created_by
       )
       SELECT ('70000000-0000-4000-8000-' || LPAD(number::text, 12, '0'))::uuid,
              'BULK-' || LPAD(number::text, 4, '0'),
              ('71000000-0000-4000-8000-' || LPAD(number::text, 12, '0'))::uuid,
              CURRENT_TIMESTAMP - number * INTERVAL '1 second',
              0, 0, 0, 0, 0, $1
       FROM generate_series(1, 501) AS number`,
      [user.rows[0]!.id],
    )

    const report = await context.agent.get('/api/v1/reports/sales')
    const csv = await context.agent.get('/api/v1/reports/sales?format=csv')

    expect(report.status).toBe(200)
    expect(report.body.data.summary.transactionCount).toBe(502)
    expect(report.body.data.transactions).toHaveLength(502)
    expect(csv.text.trim().split('\n')).toHaveLength(503)
  })
})
