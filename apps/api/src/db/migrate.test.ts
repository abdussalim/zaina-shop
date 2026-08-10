import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './database.js'
import { runMigrations } from './migrate.js'
import { createTestDatabase } from './test-database.js'

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
})
