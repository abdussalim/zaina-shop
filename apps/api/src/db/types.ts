export interface UserRow {
  id: string
  username: string
  display_name: string
  password_hash: string
  is_active: boolean
  password_changed_at: Date
}

export interface CategoryRow {
  id: string
  name: string
  color: string
  is_active: boolean
}

export interface ProductRow {
  id: string
  category_id: string
  sku: string
  barcode: string | null
  name: string
  location: string | null
  base_unit: string
  cost_price: string
  sale_price: string
  minimum_stock: string
  image_url: string | null
  is_active: boolean
}

export interface ProductUnitRow {
  id: string
  product_id: string
  name: string
  factor: string
  sale_price: string
  is_default: boolean
  discount_type: 'PERCENTAGE' | 'FIXED'
  minimum_discount: string
  maximum_discount: string
}

export interface InventoryBalanceRow {
  product_id: string
  quantity_base: string
}
