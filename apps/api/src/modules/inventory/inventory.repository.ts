import { randomUUID } from 'node:crypto'

import type { MovementType, StockMovementInput } from '@zaina/shared'

import type { Database, DatabaseClient } from '../../db/database.js'

export type LedgerMovementType = MovementType | 'SALE' | 'SALE_REVERSAL'

interface MovementRow {
  id: string
  idempotency_key: string
  product_id: string
  product_name: string
  unit_id: string
  unit_name: string
  movement_type: LedgerMovementType
  quantity_input: string | number
  factor_snapshot: string | number
  quantity_base: string | number
  balance_after: string | number
  unit_cost: string | number | null
  external_reference: string | null
  note: string | null
  created_by: string
  created_at: Date | string
}

interface LockedStockRow {
  product_id: string
  product_name: string
  unit_id: string
  unit_name: string
  factor: string | number
  quantity_base: string | number
}

export interface LockedStock {
  productId: string
  productName: string
  unitId: string
  unitName: string
  factor: number
  balance: number
}

export interface MovementInsert {
  input: StockMovementInput
  actorId: string
  factor: number
  quantityBase: number
  balanceAfter: number
}

export async function findMovementByIdempotencyKey(
  database: DatabaseClient,
  idempotencyKey: string,
) {
  const result = await database.query<MovementRow>(
    `${movementSelect} WHERE m.idempotency_key = $1`,
    [idempotencyKey],
  )
  return result.rows[0] ? mapMovement(result.rows[0]) : undefined
}

export async function lockStockUnit(
  database: DatabaseClient,
  productId: string,
  unitId: string,
): Promise<LockedStock | undefined> {
  const result = await database.query<LockedStockRow>(
    `SELECT p.id AS product_id, p.name AS product_name,
            u.id AS unit_id, u.name AS unit_name, u.factor,
            b.quantity_base
     FROM products p
     JOIN product_units u ON u.product_id = p.id
     JOIN inventory_balances b ON b.product_id = p.id
     WHERE p.id = $1 AND u.id = $2 AND p.is_active = TRUE
     FOR UPDATE OF p, b`,
    [productId, unitId],
  )
  const row = result.rows[0]
  return row
    ? {
        productId: row.product_id,
        productName: row.product_name,
        unitId: row.unit_id,
        unitName: row.unit_name,
        factor: Number(row.factor),
        balance: Number(row.quantity_base),
      }
    : undefined
}

export async function updateBalance(
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

export async function updateBaseCost(
  database: DatabaseClient,
  productId: string,
  costPrice: number,
): Promise<void> {
  await database.query(
    `UPDATE products
     SET cost_price = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [productId, costPrice],
  )
}

export async function insertMovement(
  database: DatabaseClient,
  movement: MovementInsert,
) {
  const id = randomUUID()
  const { input } = movement
  const result = await database.query<MovementRow>(
    `INSERT INTO stock_movements (
       id, idempotency_key, product_id, unit_id, movement_type,
       quantity_input, factor_snapshot, quantity_base, balance_after,
       unit_cost, external_reference, note, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id, idempotency_key, product_id,
       (SELECT name FROM products WHERE id = product_id) AS product_name,
       unit_id, (SELECT name FROM product_units WHERE id = unit_id) AS unit_name,
       movement_type, quantity_input, factor_snapshot, quantity_base,
       balance_after, unit_cost, external_reference, note, created_by, created_at`,
    [
      id,
      input.idempotencyKey,
      input.productId,
      input.unitId,
      input.type,
      input.quantity,
      movement.factor,
      movement.quantityBase,
      movement.balanceAfter,
      input.unitCost ?? null,
      input.referenceId ?? null,
      input.note ?? null,
      movement.actorId,
    ],
  )
  return mapMovement(result.rows[0]!)
}

export async function listMovements(
  database: Database,
  filters: { productId?: string; type?: LedgerMovementType; limit: number },
) {
  const values: unknown[] = []
  const conditions: string[] = []
  if (filters.productId) {
    values.push(filters.productId)
    conditions.push(`m.product_id = $${values.length}`)
  }
  if (filters.type) {
    values.push(filters.type)
    conditions.push(`m.movement_type = $${values.length}`)
  }
  values.push(filters.limit)
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const result = await database.query<MovementRow>(
    `${movementSelect} ${where}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $${values.length}`,
    values,
  )
  return result.rows.map(mapMovement)
}

export async function getInventorySummary(database: Database) {
  const result = await database.query<{
    total_products: string | number
    inventory_value: string | number
    low_stock_count: string | number
    out_of_stock_count: string | number
  }>(
    `SELECT COUNT(*) AS total_products,
            COALESCE(SUM(b.quantity_base * p.cost_price), 0) AS inventory_value,
            COUNT(*) FILTER (
              WHERE b.quantity_base > 0 AND b.quantity_base <= p.minimum_stock
            ) AS low_stock_count,
            COUNT(*) FILTER (WHERE b.quantity_base <= 0) AS out_of_stock_count
     FROM products p
     JOIN inventory_balances b ON b.product_id = p.id
     WHERE p.is_active = TRUE`,
  )
  const row = result.rows[0]!
  return {
    totalProducts: Number(row.total_products),
    inventoryValue: Number(row.inventory_value),
    lowStockCount: Number(row.low_stock_count),
    outOfStockCount: Number(row.out_of_stock_count),
  }
}

const movementSelect = `
  SELECT m.id, m.idempotency_key, m.product_id, p.name AS product_name,
         m.unit_id, u.name AS unit_name, m.movement_type,
         m.quantity_input, m.factor_snapshot, m.quantity_base,
         m.balance_after, m.unit_cost, m.external_reference,
         m.note, m.created_by, m.created_at
  FROM stock_movements m
  JOIN products p ON p.id = m.product_id
  JOIN product_units u ON u.id = m.unit_id
`

function mapMovement(row: MovementRow) {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    productId: row.product_id,
    productName: row.product_name,
    unitId: row.unit_id,
    unitName: row.unit_name,
    type: row.movement_type,
    quantityInput: Number(row.quantity_input),
    factorSnapshot: Number(row.factor_snapshot),
    quantityBase: Number(row.quantity_base),
    newBalance: Number(row.balance_after),
    unitCost: row.unit_cost === null ? null : Number(row.unit_cost),
    referenceId: row.external_reference,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}
