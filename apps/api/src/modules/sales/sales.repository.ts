import { randomUUID } from 'node:crypto'

import type { DiscountRule } from '@zaina/shared'

import type { DatabaseClient } from '../../db/database.js'

export interface StockSnapshot {
  productId: string
  productName: string
  balance: number
  costPrice: number
}

export interface UnitSnapshot extends DiscountRule {
  productId: string
  unitId: string
  unitName: string
  factor: number
  salePrice: number
}

export interface SaleLineSnapshot extends UnitSnapshot {
  productName: string
  quantityInput: number
  quantityBase: number
  costPrice: number
  costTotal: number
  subtotal: number
  discountValue: number
  discountAmount: number
  total: number
}

export async function lockStockProducts(
  database: DatabaseClient,
  productIds: readonly string[],
  options: { includeInactive?: boolean } = {},
): Promise<StockSnapshot[]> {
  if (productIds.length === 0) return []
  const placeholders = productIds.map((_id, index) => `$${index + 1}`).join(', ')
  const result = await database.query<{
    product_id: string
    product_name: string
    quantity_base: string | number
    cost_price: string | number
  }>(
    `SELECT p.id AS product_id, p.name AS product_name,
            b.quantity_base, p.cost_price
     FROM products p
     JOIN inventory_balances b ON b.product_id = p.id
     WHERE p.id IN (${placeholders})
       ${options.includeInactive ? '' : 'AND p.is_active = TRUE'}
     ORDER BY p.id
     FOR UPDATE OF p, b`,
    productIds,
  )
  return result.rows.map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    balance: Number(row.quantity_base),
    costPrice: Number(row.cost_price),
  }))
}

export async function findSellingUnits(
  database: DatabaseClient,
  unitIds: readonly string[],
): Promise<UnitSnapshot[]> {
  if (unitIds.length === 0) return []
  const placeholders = unitIds.map((_id, index) => `$${index + 1}`).join(', ')
  const result = await database.query<{
    product_id: string
    unit_id: string
    unit_name: string
    factor: string | number
    sale_price: string | number
    discount_type: 'PERCENTAGE' | 'FIXED'
    minimum_discount: string | number
    maximum_discount: string | number
  }>(
    `SELECT product_id, id AS unit_id, name AS unit_name, factor, sale_price,
            discount_type, minimum_discount, maximum_discount
     FROM product_units
     WHERE id IN (${placeholders}) AND is_active = TRUE`,
    unitIds,
  )
  return result.rows.map((row) => ({
    productId: row.product_id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    factor: Number(row.factor),
    salePrice: Number(row.sale_price),
    discountType: row.discount_type,
    minimumDiscount: Number(row.minimum_discount),
    maximumDiscount: Number(row.maximum_discount),
  }))
}

export async function insertSaleHeader(
  database: DatabaseClient,
  sale: {
    id: string
    saleNumber: string
    idempotencyKey: string
    subtotal: number
    discount: number
    total: number
    amountPaid: number
    changeAmount: number
    note?: string
    actorId: string
  },
): Promise<void> {
  await database.query(
    `INSERT INTO sales (
       id, sale_number, idempotency_key, subtotal, discount, total,
       amount_paid, change_amount, note, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      sale.id,
      sale.saleNumber,
      sale.idempotencyKey,
      sale.subtotal,
      sale.discount,
      sale.total,
      sale.amountPaid,
      sale.changeAmount,
      sale.note ?? null,
      sale.actorId,
    ],
  )
}

export async function insertSaleLine(
  database: DatabaseClient,
  saleId: string,
  line: SaleLineSnapshot,
): Promise<void> {
  await database.query(
    `INSERT INTO sale_items (
       id, sale_id, product_id, unit_id, product_name, unit_name,
       factor_snapshot, quantity_input, quantity_base, unit_price,
       cost_price, subtotal, discount_type_snapshot,
       minimum_discount_snapshot, maximum_discount_snapshot,
       discount_value, discount_amount, total
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17, $18
     )`,
    [
      randomUUID(),
      saleId,
      line.productId,
      line.unitId,
      line.productName,
      line.unitName,
      line.factor,
      line.quantityInput,
      line.quantityBase,
      line.salePrice,
      line.costPrice,
      line.subtotal,
      line.discountType,
      line.minimumDiscount,
      line.maximumDiscount,
      line.discountValue,
      line.discountAmount,
      line.total,
    ],
  )
}

export async function setStockBalance(
  database: DatabaseClient,
  productId: string,
  balance: number,
): Promise<void> {
  await database.query(
    `UPDATE inventory_balances
     SET quantity_base = $2, updated_at = CURRENT_TIMESTAMP
     WHERE product_id = $1`,
    [productId, balance],
  )
}

export async function reactivateProduct(
  database: DatabaseClient,
  productId: string,
): Promise<void> {
  await database.query(
    `UPDATE products SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND is_active = FALSE`,
    [productId],
  )
}

export async function insertSaleMovement(
  database: DatabaseClient,
  movement: {
    saleId: string
    line: SaleLineSnapshot
    quantityBase: number
    balanceAfter: number
    type: 'SALE' | 'SALE_REVERSAL'
    note?: string
    actorId: string
  },
): Promise<void> {
  await database.query(
    `INSERT INTO stock_movements (
       id, idempotency_key, product_id, product_name, unit_id, unit_name, movement_type,
       quantity_input, factor_snapshot, quantity_base, balance_after,
       reference_id, note, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      randomUUID(),
      randomUUID(),
      movement.line.productId,
      movement.line.productName,
      movement.line.unitId,
      movement.line.unitName,
      movement.type,
      movement.line.quantityInput,
      movement.line.factor,
      movement.quantityBase,
      movement.balanceAfter,
      movement.saleId,
      movement.note ?? null,
      movement.actorId,
    ],
  )
}

export async function lockSale(
  database: DatabaseClient,
  saleId: string,
): Promise<{ id: string; status: 'COMPLETED' | 'CANCELLED' } | undefined> {
  const result = await database.query<{
    id: string
    status: 'COMPLETED' | 'CANCELLED'
  }>('SELECT id, status FROM sales WHERE id = $1 FOR UPDATE', [saleId])
  return result.rows[0]
}

export async function findCancellationLines(
  database: DatabaseClient,
  saleId: string,
): Promise<SaleLineSnapshot[]> {
  const result = await database.query<{
    product_id: string
    product_name: string
    unit_id: string
    unit_name: string
    factor_snapshot: string | number
    quantity_input: string | number
    quantity_base: string | number
    unit_price: string | number
    cost_price: string | number
    subtotal: string | number
    discount_type_snapshot: 'PERCENTAGE' | 'FIXED'
    minimum_discount_snapshot: string | number
    maximum_discount_snapshot: string | number
    discount_value: string | number
    discount_amount: string | number
    total: string | number
  }>(
    `SELECT product_id, product_name, unit_id, unit_name, factor_snapshot,
            quantity_input, quantity_base, unit_price, cost_price, subtotal,
            discount_type_snapshot, minimum_discount_snapshot,
            maximum_discount_snapshot, discount_value, discount_amount, total
     FROM sale_items WHERE sale_id = $1 ORDER BY product_id`,
    [saleId],
  )
  return result.rows.map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    unitId: row.unit_id,
    unitName: row.unit_name,
    factor: Number(row.factor_snapshot),
    quantityInput: Number(row.quantity_input),
    quantityBase: Number(row.quantity_base),
    salePrice: Number(row.unit_price),
    costPrice: Number(row.cost_price),
    costTotal: Number(row.quantity_base) * Number(row.cost_price),
    subtotal: Number(row.subtotal),
    discountType: row.discount_type_snapshot,
    minimumDiscount: Number(row.minimum_discount_snapshot),
    maximumDiscount: Number(row.maximum_discount_snapshot),
    discountValue: Number(row.discount_value),
    discountAmount: Number(row.discount_amount),
    total: Number(row.total),
  }))
}

export async function markSaleCancelled(
  database: DatabaseClient,
  saleId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  await database.query(
    `UPDATE sales SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP,
       cancellation_reason = $2, cancelled_by = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [saleId, reason, actorId],
  )
}
