import argon2 from 'argon2'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from './database.js'
import { runMigrations } from './migrate.js'
import { seedDatabase, type SeedConfig } from './seed.js'
import { createTestDatabase } from './test-database.js'

const seedConfig: SeedConfig = {
  adminUsername: 'toko',
  adminPassword: 'rahasia-yang-kuat',
  storeName: 'Toko Zaina',
  storeTimezone: 'Asia/Jakarta',
  seedDemoData: false,
}

describe('seedDatabase', () => {
  let database: Database

  beforeEach(async () => {
    database = await createTestDatabase()
    await runMigrations(database)
  })

  afterEach(async () => {
    await database.close()
  })

  it('creates one secure admin account and remains idempotent', async () => {
    await seedDatabase(database, seedConfig)
    await seedDatabase(database, seedConfig)

    const users = await database.query<{
      username: string
      password_hash: string
    }>('SELECT username, password_hash FROM users')
    const settings = await database.query<{ store_name: string; timezone: string }>(
      'SELECT store_name, timezone FROM store_settings WHERE id = 1',
    )
    const categories = await database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM categories',
    )

    expect(users.rows).toHaveLength(1)
    expect(users.rows[0]?.username).toBe('toko')
    expect(
      await argon2.verify(users.rows[0]?.password_hash ?? '', 'rahasia-yang-kuat'),
    ).toBe(true)
    expect(settings.rows[0]).toEqual({
      store_name: 'Toko Zaina',
      timezone: 'Asia/Jakarta',
    })
    expect(categories.rows[0]?.count).toBe('4')
  })

  it('preserves account and store changes across application restarts', async () => {
    await seedDatabase(database, seedConfig)
    await database.query(
      `UPDATE store_settings SET store_name = 'Rumah Bening', timezone = 'Asia/Makassar'
       WHERE id = 1`,
    )

    await seedDatabase(database, {
      ...seedConfig,
      adminUsername: 'pemilik-baru',
      storeName: 'Nama dari environment',
      storeTimezone: 'Asia/Jayapura',
    })

    const users = await database.query<{ username: string }>('SELECT username FROM users')
    const settings = await database.query<{ store_name: string; timezone: string }>(
      'SELECT store_name, timezone FROM store_settings WHERE id = 1',
    )
    expect(users.rows).toEqual([{ username: 'toko' }])
    expect(settings.rows[0]).toEqual({
      store_name: 'Rumah Bening',
      timezone: 'Asia/Makassar',
    })
  })

  it('adds useful demonstration inventory only when explicitly enabled', async () => {
    await seedDatabase(database, { ...seedConfig, seedDemoData: true })

    const products = await database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM products',
    )
    const balances = await database.query<{ total: string }>(
      'SELECT SUM(quantity_base)::text AS total FROM inventory_balances',
    )

    expect(products.rows[0]?.count).toBe('3')
    expect(balances.rows[0]?.total).toBe('66.000')
  })
})
