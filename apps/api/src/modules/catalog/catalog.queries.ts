import type { Database } from '../../db/database.js'

interface CategoryRecord {
  id: string
  name: string
  color: string
  is_active: boolean
}

interface ProductRecord {
  id: string
  category_id: string
  category_name: string
  category_color: string
  sku: string
  barcode: string | null
  name: string
  location: string | null
  base_unit: string
  cost_price: string | number
  sale_price: string | number
  minimum_stock: string | number
  image_url: string | null
  is_active: boolean
  balance_base: string | number
}

interface UnitRecord {
  id: string
  product_id: string
  name: string
  factor: string | number
  sale_price: string | number
  is_default: boolean
}

export interface ProductListFilters {
  query?: string
  categoryId?: string
  stockStatus?: 'OUT_OF_STOCK' | 'LOW' | 'OK'
  includeInactive: boolean
}

export async function listCategories(database: Database) {
  const result = await database.query<CategoryRecord>(
    `SELECT id, name, color, is_active
     FROM categories
     WHERE is_active = TRUE
     ORDER BY name`,
  )
  return result.rows.map((category) => ({
    id: category.id,
    name: category.name,
    color: category.color,
    isActive: category.is_active,
  }))
}

export async function findProduct(database: Database, productId: string) {
  const result = await database.query<ProductRecord>(
    `${productSelect} WHERE p.id = $1`,
    [productId],
  )
  const product = result.rows[0]
  if (!product) return undefined
  const units = await findUnits(database, [productId])
  return mapProduct(product, units.get(productId) ?? [])
}

export async function findProducts(
  database: Database,
  filters: ProductListFilters,
) {
  const values: unknown[] = []
  const conditions: string[] = []
  if (!filters.includeInactive) conditions.push('p.is_active = TRUE')
  if (filters.query) {
    values.push(`%${filters.query}%`)
    conditions.push(
      `(LOWER(p.name) LIKE LOWER($${values.length}) OR LOWER(p.sku) LIKE LOWER($${values.length}))`,
    )
  }
  if (filters.categoryId) {
    values.push(filters.categoryId)
    conditions.push(`p.category_id = $${values.length}`)
  }
  addStockCondition(conditions, filters.stockStatus)

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const result = await database.query<ProductRecord>(
    `${productSelect} ${where} ORDER BY p.name, p.id`,
    values,
  )
  const units = await findUnits(
    database,
    result.rows.map((product) => product.id),
  )
  return result.rows.map((product) => mapProduct(product, units.get(product.id) ?? []))
}

function addStockCondition(
  conditions: string[],
  stockStatus: ProductListFilters['stockStatus'],
) {
  if (stockStatus === 'OUT_OF_STOCK') {
    conditions.push('COALESCE(b.quantity_base, 0) <= 0')
  } else if (stockStatus === 'LOW') {
    conditions.push('COALESCE(b.quantity_base, 0) > 0 AND COALESCE(b.quantity_base, 0) <= p.minimum_stock')
  } else if (stockStatus === 'OK') {
    conditions.push('COALESCE(b.quantity_base, 0) > p.minimum_stock')
  }
}

async function findUnits(database: Database, productIds: readonly string[]) {
  const grouped = new Map<string, UnitRecord[]>()
  if (productIds.length === 0) return grouped
  const placeholders = productIds.map((_id, index) => `$${index + 1}`).join(', ')
  const result = await database.query<UnitRecord>(
    `SELECT id, product_id, name, factor, sale_price, is_default
     FROM product_units
     WHERE product_id IN (${placeholders}) AND is_active = TRUE
     ORDER BY factor, name`,
    productIds,
  )
  for (const unit of result.rows) {
    grouped.set(unit.product_id, [...(grouped.get(unit.product_id) ?? []), unit])
  }
  return grouped
}

const productSelect = `
  SELECT p.id, p.category_id, c.name AS category_name, c.color AS category_color,
         p.sku, p.barcode, p.name, p.location, p.base_unit, p.cost_price,
         p.sale_price, p.minimum_stock, p.image_url, p.is_active,
         COALESCE(b.quantity_base, 0) AS balance_base
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN inventory_balances b ON b.product_id = p.id
`

function mapProduct(product: ProductRecord, units: readonly UnitRecord[]) {
  const balanceBase = Number(product.balance_base)
  const minimumStock = Number(product.minimum_stock)
  const stockStatus =
    balanceBase <= 0 ? 'OUT_OF_STOCK' : balanceBase <= minimumStock ? 'LOW' : 'OK'

  return {
    id: product.id,
    categoryId: product.category_id,
    category: {
      id: product.category_id,
      name: product.category_name,
      color: product.category_color,
    },
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    location: product.location,
    baseUnit: product.base_unit,
    costPrice: Number(product.cost_price),
    salePrice: Number(product.sale_price),
    minimumStock,
    imageUrl: product.image_url,
    isActive: product.is_active,
    balanceBase,
    stockStatus,
    units: units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      factor: Number(unit.factor),
      salePrice: Number(unit.sale_price),
      isDefault: unit.is_default,
    })),
  }
}
