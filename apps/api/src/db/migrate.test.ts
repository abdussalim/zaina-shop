import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './database.js'
import { runMigrations } from './migrate.js'
import { createTestDatabase } from './test-database.js'

const migrationDirectory = fileURLToPath(new URL('./migrations/', import.meta.url))

describe('runMigrations', () => {
  let database: Database

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.close()
  })

  it('creates the complete inventory schema', async () => {
    await runMigrations(database)

    const result = await database.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    )
    const tables = result.rows.map((row) => row.table_name)

    expect(tables).toEqual(
      expect.arrayContaining([
        'users',
        'categories',
        'products',
        'product_units',
        'inventory_balances',
        'stock_movements',
        'sales',
        'sale_items',
        'store_settings',
        'session',
      ]),
    )
  })

  it('does not apply the same migration twice', async () => {
    await runMigrations(database)
    const firstRun = await database.query<{ version: string }>(
      'select version from schema_migrations order by version',
    )
    await runMigrations(database)

    const secondRun = await database.query<{ version: string }>(
      'select version from schema_migrations order by version',
    )
    expect(firstRun.rows.length).toBeGreaterThan(0)
    expect(secondRun.rows).toEqual(firstRun.rows)
  })

  it('backfills legacy sale lines and enforces unit discount integrity', async () => {
    await database.exec(
      await readFile(`${migrationDirectory}/001_initial.sql`, 'utf8'),
    )
    await database.exec(
      await readFile(`${migrationDirectory}/002_movement_snapshots.sql`, 'utf8'),
    )

    const userId = '10000000-0000-4000-8000-000000000099'
    const categoryId = '20000000-0000-4000-8000-000000000099'
    const productId = '30000000-0000-4000-8000-000000000099'
    const unitId = '40000000-0000-4000-8000-000000000099'
    const saleId = '50000000-0000-4000-8000-000000000099'
    const itemId = '60000000-0000-4000-8000-000000000099'

    await database.query(
      `INSERT INTO users (id, username, display_name, password_hash)
       VALUES ($1, 'legacy-user', 'Legacy User', 'unused-test-hash')`,
      [userId],
    )
    await database.query(
      `INSERT INTO categories (id, name, color)
       VALUES ($1, 'Legacy', '#123456')`,
      [categoryId],
    )
    await database.query(
      `INSERT INTO products (
         id, category_id, sku, name, base_unit, cost_price, sale_price
       ) VALUES ($1, $2, 'LEG-001', 'Barang Lama', 'buah', 7000, 10000)`,
      [productId, categoryId],
    )
    await database.query(
      `INSERT INTO product_units (
         id, product_id, name, factor, sale_price, is_default
       ) VALUES ($1, $2, 'buah', 1, 10000, TRUE)`,
      [unitId, productId],
    )
    await database.query(
      `INSERT INTO inventory_balances (product_id, quantity_base)
       VALUES ($1, 1)`,
      [productId],
    )
    await database.query(
      `INSERT INTO sales (
         id, sale_number, idempotency_key, subtotal, discount, total,
         amount_paid, change_amount, created_by
       ) VALUES (
         $1, 'PJ-LEGACY-001', '70000000-0000-4000-8000-000000000099',
         10000, 1000, 9000, 10000, 1000, $2
       )`,
      [saleId, userId],
    )
    await database.query(
      `INSERT INTO sale_items (
         id, sale_id, product_id, unit_id, product_name, unit_name,
         factor_snapshot, quantity_input, quantity_base, unit_price,
         cost_price, subtotal
       ) VALUES ($1, $2, $3, $4, 'Barang Lama', 'buah', 1, 1, 1, 10000, 7000, 10000)`,
      [itemId, saleId, productId, unitId],
    )

    const newMigration = await readFile(
      `${migrationDirectory}/003_unit_discounts.sql`,
      'utf8',
    ).catch(() => '')
    if (newMigration) await database.exec(newMigration)

    const columns = await database.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name IN ('product_units', 'sale_items')`,
    )
    expect(columns.rows.map((column) => column.column_name)).toEqual(
      expect.arrayContaining([
        'discount_type',
        'minimum_discount',
        'maximum_discount',
        'discount_type_snapshot',
        'discount_value',
        'discount_amount',
        'total',
      ]),
    )

    const unit = await database.query<{
      discount_type: string
      minimum_discount: string
      maximum_discount: string
    }>(
      `SELECT discount_type, minimum_discount, maximum_discount
       FROM product_units WHERE id = $1`,
      [unitId],
    )
    const item = await database.query<{
      discount_amount: string | number
      total: string | number
    }>(
      `SELECT discount_amount, total FROM sale_items WHERE id = $1`,
      [itemId],
    )

    expect(unit.rows[0]).toMatchObject({
      discount_type: 'PERCENTAGE',
      minimum_discount: '0.000',
      maximum_discount: '0.000',
    })
    expect(Number(item.rows[0]?.discount_amount)).toBe(0)
    expect(Number(item.rows[0]?.total)).toBe(10_000)

    await expect(
      database.query(
        `UPDATE product_units
         SET discount_type = 'PERCENTAGE', maximum_discount = 100.001
         WHERE id = $1`,
        [unitId],
      ),
    ).rejects.toBeDefined()
    await expect(
      database.query(
        `UPDATE product_units
         SET discount_type = 'FIXED', minimum_discount = 1.5,
             maximum_discount = 2000
         WHERE id = $1`,
        [unitId],
      ),
    ).rejects.toBeDefined()
    await expect(
      database.query(
        `UPDATE product_units
         SET discount_type = 'FIXED', minimum_discount = 2000,
             maximum_discount = 10001
         WHERE id = $1`,
        [unitId],
      ),
    ).rejects.toBeDefined()
    await expect(
      database.query('UPDATE sale_items SET total = 9999 WHERE id = $1', [itemId]),
    ).rejects.toBeDefined()
  })
})
