import type { Database, DatabaseClient } from '../../db/database.js'

interface SaleRow {
  id: string
  sale_number: string
  idempotency_key: string
  sold_at: Date | string
  status: 'COMPLETED' | 'CANCELLED'
  subtotal: string | number
  discount: string | number
  total: string | number
  amount_paid: string | number
  change_amount: string | number
  note: string | null
  created_by: string
  cancelled_at: Date | string | null
  cancellation_reason: string | null
}

interface SaleItemRow {
  id: string
  product_id: string
  unit_id: string
  product_name: string
  unit_name: string
  factor_snapshot: string | number
  quantity_input: string | number
  quantity_base: string | number
  unit_price: string | number
  cost_price: string | number
  subtotal: string | number
}

export async function findSaleByIdempotencyKey(
  database: Database,
  idempotencyKey: string,
) {
  const result = await database.query<{ id: string }>(
    'SELECT id FROM sales WHERE idempotency_key = $1',
    [idempotencyKey],
  )
  return result.rows[0] ? findSale(database, result.rows[0].id) : undefined
}

export async function findSale(
  database: Database | DatabaseClient,
  saleId: string,
) {
  const result = await database.query<SaleRow>(
    `${saleSelect} WHERE s.id = $1`,
    [saleId],
  )
  const sale = result.rows[0]
  if (!sale) return undefined
  const items = await database.query<SaleItemRow>(
    `${saleItemSelect} WHERE si.sale_id = $1 ORDER BY si.created_at, si.id`,
    [saleId],
  )
  return mapSale(sale, items.rows)
}

export async function listSales(
  database: Database,
  filters: {
    status?: 'COMPLETED' | 'CANCELLED'
    from?: string
    to?: string
    limit: number
  },
  timezone: string,
) {
  const values: unknown[] = []
  const conditions: string[] = []
  if (filters.status) {
    values.push(filters.status)
    conditions.push(`s.status = $${values.length}`)
  }
  let timezonePlaceholder: string | undefined
  if (filters.from || filters.to) {
    values.push(timezone)
    timezonePlaceholder = `$${values.length}`
  }
  if (filters.from) {
    values.push(filters.from)
    conditions.push(
      `(s.sold_at AT TIME ZONE ${timezonePlaceholder})::date >= $${values.length}::date`,
    )
  }
  if (filters.to) {
    values.push(filters.to)
    conditions.push(
      `(s.sold_at AT TIME ZONE ${timezonePlaceholder})::date <= $${values.length}::date`,
    )
  }
  values.push(filters.limit)
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const result = await database.query<SaleRow>(
    `${saleSelect} ${where}
     ORDER BY s.sold_at DESC, s.id DESC LIMIT $${values.length}`,
    values,
  )
  return result.rows.map((sale) => mapSale(sale))
}

const saleSelect = `
  SELECT s.id, s.sale_number, s.idempotency_key, s.sold_at, s.status,
         s.subtotal, s.discount, s.total, s.amount_paid, s.change_amount,
         s.note, s.created_by, s.cancelled_at, s.cancellation_reason
  FROM sales s
`

const saleItemSelect = `
  SELECT si.id, si.product_id, si.unit_id, si.product_name, si.unit_name,
         si.factor_snapshot, si.quantity_input, si.quantity_base,
         si.unit_price, si.cost_price, si.subtotal
  FROM sale_items si
`

function mapSale(sale: SaleRow, items?: readonly SaleItemRow[]) {
  return {
    id: sale.id,
    saleNumber: sale.sale_number,
    idempotencyKey: sale.idempotency_key,
    soldAt: sale.sold_at,
    status: sale.status,
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    total: Number(sale.total),
    amountPaid: Number(sale.amount_paid),
    changeAmount: Number(sale.change_amount),
    note: sale.note,
    createdBy: sale.created_by,
    cancelledAt: sale.cancelled_at,
    cancellationReason: sale.cancellation_reason,
    ...(items ? { items: items.map(mapSaleItem) } : {}),
  }
}

function mapSaleItem(item: SaleItemRow) {
  return {
    id: item.id,
    productId: item.product_id,
    unitId: item.unit_id,
    productName: item.product_name,
    unitName: item.unit_name,
    factorSnapshot: Number(item.factor_snapshot),
    quantityInput: Number(item.quantity_input),
    quantityBase: Number(item.quantity_base),
    unitPrice: Number(item.unit_price),
    costPrice: Number(item.cost_price),
    subtotal: Number(item.subtotal),
  }
}
