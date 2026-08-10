import type { Database, DatabaseClient } from '../../db/database.js'
import type { DateFilters } from '../../http/date-range.js'
import { getInventorySummary } from '../inventory/inventory.repository.js'

export async function getDashboard(database: Database, timezone: string) {
  return database.transaction(
    (transaction) => getDashboardSnapshot(transaction, timezone),
    { isolationLevel: 'REPEATABLE READ' },
  )
}

async function getDashboardSnapshot(database: DatabaseClient, timezone: string) {
  const sales = await database.query<{
    sales_today: string | number
    revenue_today: string | number
  }>(
    `SELECT COUNT(*) AS sales_today, COALESCE(SUM(total), 0) AS revenue_today
     FROM sales
     WHERE status = 'COMPLETED'
       AND (sold_at AT TIME ZONE $1)::date =
           (CURRENT_TIMESTAMP AT TIME ZONE $1)::date`,
    [timezone],
  )
  const costs = await database.query<{ cost_today: string | number }>(
    `SELECT COALESCE(SUM(si.quantity_base * si.cost_price), 0) AS cost_today
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.status = 'COMPLETED'
       AND (s.sold_at AT TIME ZONE $1)::date =
           (CURRENT_TIMESTAMP AT TIME ZONE $1)::date`,
    [timezone],
  )
  const inventory = await getInventorySummary(database)
  const recentSales = await database.query<{
    id: string
    sale_number: string
    sold_at: Date | string
    total: string | number
    status: 'COMPLETED' | 'CANCELLED'
  }>(
    `SELECT id, sale_number, sold_at, total, status
     FROM sales ORDER BY sold_at DESC, id DESC LIMIT 5`,
  )
  const recentMovements = await database.query<{
    id: string
    product_name: string
    movement_type: string
    quantity_base: string | number
    created_at: Date | string
  }>(
    `SELECT m.id, m.product_name, m.movement_type,
            m.quantity_base, m.created_at
     FROM stock_movements m
     ORDER BY m.created_at DESC, m.id DESC LIMIT 6`,
  )
  const lowStockProducts = await database.query<{
    id: string
    sku: string
    name: string
    base_unit: string
    balance_base: string | number
    minimum_stock: string | number
  }>(
    `SELECT p.id, p.sku, p.name, p.base_unit,
            b.quantity_base AS balance_base, p.minimum_stock
     FROM products p
     JOIN inventory_balances b ON b.product_id = p.id
     WHERE p.is_active = TRUE AND b.quantity_base <= p.minimum_stock
     ORDER BY b.quantity_base, p.name LIMIT 8`,
  )

  const saleRow = sales.rows[0]!
  const revenueToday = Number(saleRow.revenue_today)
  const costToday = Number(costs.rows[0]!.cost_today)
  return {
    salesToday: Number(saleRow.sales_today),
    revenueToday,
    profitToday: revenueToday - costToday,
    ...inventory,
    recentSales: recentSales.rows.map((row) => ({
      id: row.id,
      saleNumber: row.sale_number,
      soldAt: row.sold_at,
      total: Number(row.total),
      status: row.status,
    })),
    recentMovements: recentMovements.rows.map((row) => ({
      id: row.id,
      productName: row.product_name,
      type: row.movement_type,
      quantityBase: Number(row.quantity_base),
      createdAt: row.created_at,
    })),
    lowStockProducts: lowStockProducts.rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      baseUnit: row.base_unit,
      balanceBase: Number(row.balance_base),
      minimumStock: Number(row.minimum_stock),
    })),
  }
}

export async function getSalesReport(
  database: Database,
  filters: DateFilters,
  timezone: string,
) {
  return database.transaction(
    (transaction) => getSalesReportSnapshot(transaction, filters, timezone),
    { isolationLevel: 'REPEATABLE READ' },
  )
}

async function getSalesReportSnapshot(
  database: DatabaseClient,
  filters: DateFilters,
  timezone: string,
) {
  const aggregateFilter = buildSalesFilter(filters, timezone, 's')
  const summary = await database.query<{
    transaction_count: string | number
    gross_sales: string | number
    discounts: string | number
    net_sales: string | number
  }>(
    `SELECT COUNT(*) AS transaction_count,
            COALESCE(SUM(s.subtotal), 0) AS gross_sales,
            COALESCE(SUM(s.discount), 0) AS discounts,
            COALESCE(SUM(s.total), 0) AS net_sales
     FROM sales s WHERE ${aggregateFilter.sql}`,
    aggregateFilter.values,
  )
  const costs = await database.query<{ cost_of_goods: string | number }>(
    `SELECT COALESCE(SUM(si.quantity_base * si.cost_price), 0) AS cost_of_goods
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE ${aggregateFilter.sql}`,
    aggregateFilter.values,
  )
  const topProducts = await database.query<{
    product_id: string
    product_name: string
    quantity_base: string | number
    revenue: string | number
    cost: string | number
  }>(
    `SELECT si.product_id, si.product_name,
            SUM(si.quantity_base) AS quantity_base,
            SUM(si.subtotal) AS revenue,
            SUM(si.quantity_base * si.cost_price) AS cost
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE ${aggregateFilter.sql}
     GROUP BY si.product_id, si.product_name
     ORDER BY quantity_base DESC, revenue DESC LIMIT 20`,
    aggregateFilter.values,
  )
  const transactions = await database.query<{
    id: string
    sale_number: string
    sold_at: Date | string
    subtotal: string | number
    discount: string | number
    total: string | number
  }>(
    `SELECT s.id, s.sale_number, s.sold_at, s.subtotal, s.discount, s.total
     FROM sales s WHERE ${aggregateFilter.sql}
     ORDER BY s.sold_at DESC, s.id DESC`,
    aggregateFilter.values,
  )

  const row = summary.rows[0]!
  const netSales = Number(row.net_sales)
  const costOfGoods = Number(costs.rows[0]!.cost_of_goods)
  return {
    filters,
    summary: {
      transactionCount: Number(row.transaction_count),
      grossSales: Number(row.gross_sales),
      discounts: Number(row.discounts),
      netSales,
      costOfGoods,
      grossProfit: netSales - costOfGoods,
    },
    topProducts: topProducts.rows.map((product) => ({
      productId: product.product_id,
      productName: product.product_name,
      quantityBase: Number(product.quantity_base),
      revenue: Number(product.revenue),
      cost: Number(product.cost),
      grossProfit: Number(product.revenue) - Number(product.cost),
    })),
    transactions: transactions.rows.map((sale) => ({
      id: sale.id,
      saleNumber: sale.sale_number,
      soldAt: sale.sold_at,
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount),
      total: Number(sale.total),
    })),
  }
}

export async function getInventoryReport(database: Database) {
  return database.transaction(
    (transaction) => getInventoryReportSnapshot(transaction),
    { isolationLevel: 'REPEATABLE READ' },
  )
}

async function getInventoryReportSnapshot(database: DatabaseClient) {
  const summary = await getInventorySummary(database)
  const products = await database.query<{
    id: string
    sku: string
    name: string
    category_name: string
    location: string | null
    base_unit: string
    cost_price: string | number
    sale_price: string | number
    minimum_stock: string | number
    balance_base: string | number
    inventory_value: string | number
  }>(
    `SELECT p.id, p.sku, p.name, c.name AS category_name, p.location,
            p.base_unit, p.cost_price, p.sale_price, p.minimum_stock,
            b.quantity_base AS balance_base,
            b.quantity_base * p.cost_price AS inventory_value
     FROM products p
     JOIN categories c ON c.id = p.category_id
     JOIN inventory_balances b ON b.product_id = p.id
     WHERE p.is_active = TRUE OR b.quantity_base > 0
     ORDER BY p.name`,
  )
  return {
    summary,
    products: products.rows.map((product) => {
      const balanceBase = Number(product.balance_base)
      const minimumStock = Number(product.minimum_stock)
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        categoryName: product.category_name,
        location: product.location,
        baseUnit: product.base_unit,
        costPrice: Number(product.cost_price),
        salePrice: Number(product.sale_price),
        minimumStock,
        balanceBase,
        inventoryValue: Number(product.inventory_value),
        stockStatus:
          balanceBase <= 0 ? 'OUT_OF_STOCK' : balanceBase <= minimumStock ? 'LOW' : 'OK',
      }
    }),
  }
}

function buildSalesFilter(
  filters: DateFilters,
  timezone: string,
  alias: string,
) {
  const values: unknown[] = []
  const conditions = [`${alias}.status = 'COMPLETED'`]
  const hasDateFilter = Boolean(filters.from || filters.to)
  if (hasDateFilter) values.push(timezone)
  if (filters.from) {
    values.push(filters.from)
    conditions.push(`(${alias}.sold_at AT TIME ZONE $1)::date >= $${values.length}::date`)
  }
  if (filters.to) {
    values.push(filters.to)
    conditions.push(`(${alias}.sold_at AT TIME ZONE $1)::date <= $${values.length}::date`)
  }
  return { sql: conditions.join(' AND '), values }
}
