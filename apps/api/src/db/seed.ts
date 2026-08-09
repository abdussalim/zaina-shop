import { randomUUID } from 'node:crypto'

import argon2 from 'argon2'

import type { Database, DatabaseClient } from './database.js'

export interface SeedConfig {
  adminUsername: string
  adminPassword: string
  storeName: string
  storeTimezone: string
  seedDemoData: boolean
}

export async function seedDatabase(
  database: Database,
  config: SeedConfig,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const userId = await seedAdmin(transaction, config)
    await seedStoreSettings(transaction, config)
    await seedCategories(transaction)
    if (config.seedDemoData) {
      await seedDemoInventory(transaction, userId)
    }
  })
}

async function seedAdmin(
  database: DatabaseClient,
  config: SeedConfig,
): Promise<string> {
  const existing = await database.query<{ id: string }>(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
    [config.adminUsername],
  )
  const existingId = existing.rows[0]?.id
  if (existingId) return existingId

  const id = randomUUID()
  const passwordHash = await argon2.hash(config.adminPassword, {
    type: argon2.argon2id,
  })
  await database.query(
    `INSERT INTO users (id, username, display_name, password_hash)
     VALUES ($1, $2, $3, $4)`,
    [id, config.adminUsername, 'Pengelola Toko', passwordHash],
  )
  return id
}

async function seedStoreSettings(
  database: DatabaseClient,
  config: SeedConfig,
): Promise<void> {
  await database.query(
    `INSERT INTO store_settings (id, store_name, timezone)
     VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE SET
       store_name = EXCLUDED.store_name,
       timezone = EXCLUDED.timezone,
       updated_at = CURRENT_TIMESTAMP`,
    [config.storeName, config.storeTimezone],
  )
}

const categories = [
  ['10000000-0000-4000-8000-000000000001', 'Pecah Belah', '#B96947'],
  ['10000000-0000-4000-8000-000000000002', 'Perabot Dapur', '#66704A'],
  ['10000000-0000-4000-8000-000000000003', 'Peralatan Rumah', '#50727B'],
  ['10000000-0000-4000-8000-000000000004', 'Plastik', '#A87C3D'],
] as const

async function seedCategories(database: DatabaseClient): Promise<void> {
  for (const [id, name, color] of categories) {
    await database.query(
      `INSERT INTO categories (id, name, color)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, name, color],
    )
  }
}

interface DemoProduct {
  id: string
  categoryId: string
  sku: string
  name: string
  location: string
  baseUnit: string
  costPrice: number
  salePrice: number
  minimumStock: number
  balance: number
  units: readonly {
    id: string
    name: string
    factor: number
    salePrice: number
    isDefault: boolean
  }[]
}

const demoProducts: readonly DemoProduct[] = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    categoryId: categories[0][0],
    sku: 'PRG-001',
    name: 'Piring Kaca Bening',
    location: 'Rak A1',
    baseUnit: 'buah',
    costPrice: 7_000,
    salePrice: 10_000,
    minimumStock: 12,
    balance: 24,
    units: [
      {
        id: '30000000-0000-4000-8000-000000000001',
        name: 'buah',
        factor: 1,
        salePrice: 10_000,
        isDefault: true,
      },
      {
        id: '30000000-0000-4000-8000-000000000002',
        name: 'lusin',
        factor: 12,
        salePrice: 115_000,
        isDefault: false,
      },
    ],
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    categoryId: categories[0][0],
    sku: 'GLS-001',
    name: 'Gelas Motif Daun',
    location: 'Rak A2',
    baseUnit: 'buah',
    costPrice: 8_000,
    salePrice: 12_000,
    minimumStock: 12,
    balance: 30,
    units: [
      {
        id: '30000000-0000-4000-8000-000000000003',
        name: 'buah',
        factor: 1,
        salePrice: 12_000,
        isDefault: true,
      },
      {
        id: '30000000-0000-4000-8000-000000000004',
        name: 'set',
        factor: 6,
        salePrice: 68_000,
        isDefault: false,
      },
    ],
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    categoryId: categories[1][0],
    sku: 'WJN-001',
    name: 'Wajan Anti Lengket 24 cm',
    location: 'Rak B1',
    baseUnit: 'buah',
    costPrice: 65_000,
    salePrice: 89_000,
    minimumStock: 4,
    balance: 12,
    units: [
      {
        id: '30000000-0000-4000-8000-000000000005',
        name: 'buah',
        factor: 1,
        salePrice: 89_000,
        isDefault: true,
      },
    ],
  },
]

async function seedDemoInventory(
  database: DatabaseClient,
  userId: string,
): Promise<void> {
  for (const [index, product] of demoProducts.entries()) {
    await database.query(
      `INSERT INTO products (
         id, category_id, sku, name, location, base_unit,
         cost_price, sale_price, minimum_stock
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        product.id,
        product.categoryId,
        product.sku,
        product.name,
        product.location,
        product.baseUnit,
        product.costPrice,
        product.salePrice,
        product.minimumStock,
      ],
    )

    for (const unit of product.units) {
      await database.query(
        `INSERT INTO product_units (
           id, product_id, name, factor, sale_price, is_default
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          unit.id,
          product.id,
          unit.name,
          unit.factor,
          unit.salePrice,
          unit.isDefault,
        ],
      )
    }

    await database.query(
      `INSERT INTO inventory_balances (product_id, quantity_base)
       VALUES ($1, $2)
       ON CONFLICT (product_id) DO NOTHING`,
      [product.id, product.balance],
    )

    const defaultUnit = product.units.find((unit) => unit.isDefault)
    if (!defaultUnit) throw new Error(`Satuan default demo tidak ditemukan: ${product.sku}`)

    await database.query(
      `INSERT INTO stock_movements (
         id, product_id, unit_id, movement_type, quantity_input,
         factor_snapshot, quantity_base, unit_cost, note, created_by
       ) VALUES ($1, $2, $3, 'OPENING', $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        product.id,
        defaultUnit.id,
        product.balance,
        defaultUnit.factor,
        product.balance,
        product.costPrice,
        'Stok awal data demonstrasi',
        userId,
      ],
    )
  }
}
