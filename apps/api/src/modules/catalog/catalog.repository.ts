import { randomUUID } from 'node:crypto'

import type { ProductInput } from '@zaina/shared'

import type { Database, DatabaseClient } from '../../db/database.js'
import { AppError } from '../../http/errors.js'

interface UnitRecord {
  id: string
  product_id: string
  name: string
  factor: string | number
  sale_price: string | number
  discount_type: 'PERCENTAGE' | 'FIXED'
  minimum_discount: string | number
  maximum_discount: string | number
  is_default: boolean
  is_active: boolean
}

export async function insertCategory(
  database: Database,
  input: { name: string; color: string },
) {
  const id = randomUUID()
  await database.query(
    `INSERT INTO categories (id, name, color) VALUES ($1, $2, $3)`,
    [id, input.name, input.color],
  )
  return { id, name: input.name, color: input.color, isActive: true }
}

export async function insertProduct(
  database: Database,
  input: ProductInput,
): Promise<string> {
  const productId = randomUUID()
  await database.transaction(async (transaction) => {
    await transaction.query(
      `INSERT INTO products (
         id, category_id, sku, barcode, name, location, base_unit,
         cost_price, sale_price, minimum_stock, image_url
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        productId,
        input.categoryId,
        input.sku,
        input.barcode ?? null,
        input.name,
        input.location ?? null,
        input.baseUnit,
        input.costPrice,
        input.salePrice,
        input.minimumStock,
        input.imageUrl ?? null,
      ],
    )
    await replaceOrUpdateUnits(transaction, productId, input)
    await transaction.query(
      'INSERT INTO inventory_balances (product_id, quantity_base) VALUES ($1, 0)',
      [productId],
    )
  })
  return productId
}

export async function updateProductRecord(
  database: Database,
  productId: string,
  input: ProductInput,
): Promise<boolean> {
  return database.transaction(async (transaction) => {
    const result = await transaction.query(
      `UPDATE products SET
         category_id = $2, sku = $3, barcode = $4, name = $5, location = $6,
         base_unit = $7, cost_price = $8, sale_price = $9,
         minimum_stock = $10, image_url = $11, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        productId,
        input.categoryId,
        input.sku,
        input.barcode ?? null,
        input.name,
        input.location ?? null,
        input.baseUnit,
        input.costPrice,
        input.salePrice,
        input.minimumStock,
        input.imageUrl ?? null,
      ],
    )
    if (result.rowCount === 0) return false
    await replaceOrUpdateUnits(transaction, productId, input)
    return true
  })
}

async function replaceOrUpdateUnits(
  database: DatabaseClient,
  productId: string,
  input: ProductInput,
): Promise<void> {
  const current = await database.query<UnitRecord>(
    `SELECT id, product_id, name, factor, sale_price, discount_type,
            minimum_discount, maximum_discount, is_default, is_active
     FROM product_units WHERE product_id = $1`,
    [productId],
  )
  const suppliedIds = input.units.flatMap((unit) => (unit.id ? [unit.id] : []))
  const currentById = new Map(current.rows.map((unit) => [unit.id, unit]))
  const activeByName = new Map(
    current.rows
      .filter((unit) => unit.is_active)
      .map((unit) => [normalizeUnitName(unit.name), unit]),
  )
  if (
    new Set(suppliedIds).size !== suppliedIds.length ||
    suppliedIds.some((id) => !currentById.has(id))
  ) {
    throw invalidProductUnit()
  }

  await database.query(
    `UPDATE product_units SET is_default = FALSE, is_active = FALSE,
       updated_at = CURRENT_TIMESTAMP WHERE product_id = $1`,
    [productId],
  )

  for (const unit of input.units) {
    const existing = unit.id
      ? currentById.get(unit.id)
      : activeByName.get(normalizeUnitName(unit.name))
    if (existing && hasSameUnitIdentity(existing, unit)) {
      const updated = await database.query(
        `UPDATE product_units SET
           name = $3, factor = $4, sale_price = $5, discount_type = $6,
           minimum_discount = $7, maximum_discount = $8, is_default = $9,
           is_active = TRUE,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND product_id = $2`,
        [
          existing.id,
          productId,
          unit.name,
          unit.factor,
          unit.salePrice,
          unit.discountType,
          unit.minimumDiscount,
          unit.maximumDiscount,
          unit.isDefault,
        ],
      )
      if (updated.rowCount !== 1) throw invalidProductUnit()
      continue
    }

    await database.query(
      `INSERT INTO product_units (
         id, product_id, name, factor, sale_price, discount_type,
         minimum_discount, maximum_discount, is_default
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        productId,
        unit.name,
        unit.factor,
        unit.salePrice,
        unit.discountType,
        unit.minimumDiscount,
        unit.maximumDiscount,
        unit.isDefault,
      ],
    )
  }

  const invariant = await database.query<{
    active_count: string | number
    base_count: string | number
    default_count: string | number
    factor_one_count: string | number
  }>(
    `SELECT COUNT(*) FILTER (WHERE is_active) AS active_count,
            COUNT(*) FILTER (
              WHERE is_active AND factor = 1 AND LOWER(name) = LOWER($2)
            ) AS base_count,
            COUNT(*) FILTER (WHERE is_active AND is_default) AS default_count,
            COUNT(*) FILTER (WHERE is_active AND factor = 1) AS factor_one_count
     FROM product_units WHERE product_id = $1`,
    [productId, input.baseUnit],
  )
  const row = invariant.rows[0]!
  if (
    Number(row.active_count) !== input.units.length ||
    Number(row.base_count) !== 1 ||
    Number(row.default_count) !== 1 ||
    Number(row.factor_one_count) !== 1
  ) {
    throw invalidProductUnit()
  }
}

function hasSameUnitIdentity(
  current: UnitRecord,
  requested: ProductInput['units'][number],
): boolean {
  return (
    normalizeUnitName(current.name) === normalizeUnitName(requested.name) &&
    Number(current.factor) === requested.factor
  )
}

function normalizeUnitName(name: string): string {
  return name.toLocaleLowerCase('id-ID')
}

function invalidProductUnit(): AppError {
  return new AppError(
    422,
    'INVALID_PRODUCT_UNIT',
    'Satuan barang tidak valid atau bukan milik barang ini',
  )
}

export async function archiveProductRecord(
  database: Database,
  productId: string,
): Promise<'ARCHIVED' | 'HAS_STOCK' | 'NOT_FOUND'> {
  return database.transaction(async (transaction) => {
    const product = await transaction.query<{
      is_active: boolean
      quantity_base: string | number
    }>(
      `SELECT p.is_active, b.quantity_base
       FROM products p
       JOIN inventory_balances b ON b.product_id = p.id
       WHERE p.id = $1
       FOR UPDATE OF p, b`,
      [productId],
    )
    const row = product.rows[0]
    if (!row?.is_active) return 'NOT_FOUND'
    if (Number(row.quantity_base) > 0) return 'HAS_STOCK'

    const result = await transaction.query(
      `UPDATE products SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND is_active = TRUE`,
      [productId],
    )
    return result.rowCount === 1 ? 'ARCHIVED' : 'NOT_FOUND'
  })
}
