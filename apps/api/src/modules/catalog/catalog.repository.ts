import { randomUUID } from 'node:crypto'

import type { ProductInput } from '@zaina/shared'

import type { Database, DatabaseClient } from '../../db/database.js'

interface UnitRecord {
  id: string
  product_id: string
  name: string
  factor: string | number
  sale_price: string | number
  is_default: boolean
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
    `SELECT id, product_id, name, factor, sale_price, is_default
     FROM product_units WHERE product_id = $1`,
    [productId],
  )
  const byName = new Map(
    current.rows.map((unit) => [unit.name.toLocaleLowerCase('id-ID'), unit.id]),
  )
  await database.query(
    'UPDATE product_units SET is_default = FALSE WHERE product_id = $1',
    [productId],
  )

  for (const unit of input.units) {
    const existingId = unit.id ?? byName.get(unit.name.toLocaleLowerCase('id-ID'))
    if (existingId) {
      await database.query(
        `UPDATE product_units SET
           name = $3, factor = $4, sale_price = $5, is_default = $6,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND product_id = $2`,
        [
          existingId,
          productId,
          unit.name,
          unit.factor,
          unit.salePrice,
          unit.isDefault,
        ],
      )
      continue
    }

    await database.query(
      `INSERT INTO product_units (
         id, product_id, name, factor, sale_price, is_default
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        productId,
        unit.name,
        unit.factor,
        unit.salePrice,
        unit.isDefault,
      ],
    )
  }
}

export async function archiveProductRecord(
  database: Database,
  productId: string,
): Promise<boolean> {
  const result = await database.query(
    `UPDATE products SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND is_active = TRUE`,
    [productId],
  )
  return result.rowCount > 0
}
