import type { Product, ProductUnit } from '../api/types.js'
import {
  SNAPSHOT_VERSION,
  type InventorySnapshot,
  type OfflineProduct,
  type OfflineProductUnit,
} from './types.js'

function numberOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function sanitizeUnit(unit: ProductUnit, index: number): OfflineProductUnit {
  return {
    id: typeof unit.id === 'string' && unit.id.length > 0 ? unit.id : `offline-unit-${index}`,
    name: typeof unit.name === 'string' && unit.name.length > 0 ? unit.name : 'Satuan',
    factor: Math.max(0.000001, numberOr(unit.factor, 1)),
    salePrice: Math.max(0, numberOr(unit.salePrice, 0)),
    isDefault: Boolean(unit.isDefault),
    discountType: unit.discountType === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
    minimumDiscount: Math.max(0, numberOr(unit.minimumDiscount, 0)),
    maximumDiscount: Math.max(0, numberOr(unit.maximumDiscount, 0)),
  }
}

export function sanitizeProduct(product: Product): OfflineProduct {
  if (!product || typeof product.id !== 'string' || product.id.length === 0) {
    throw new TypeError('Produk snapshot harus memiliki id')
  }
  const units = Array.isArray(product.units) ? product.units.map(sanitizeUnit) : []
  const defaultUnit = units.find((unit) => unit.isDefault) ?? units[0]
  const salePrice = Math.max(0, numberOr(defaultUnit?.salePrice ?? product.salePrice, 0))
  const minimumDiscountPercent = defaultUnit?.discountType === 'PERCENTAGE' ? defaultUnit.minimumDiscount : 0
  const maximumDiscountPercent = defaultUnit?.discountType === 'PERCENTAGE' ? defaultUnit.maximumDiscount : 0
  const balance = numberOr(product.balanceBase, 0)
  const minimumStock = Math.max(0, numberOr(product.minimumStock, 0))
  const stockStatus = product.stockStatus ?? (balance <= 0 ? 'OUT_OF_STOCK' : balance <= minimumStock ? 'LOW' : 'OK')
  return {
    id: product.id,
    sku: typeof product.sku === 'string' ? product.sku : '',
    name: typeof product.name === 'string' ? product.name : 'Barang tanpa nama',
    category: typeof product.category?.name === 'string' ? product.category.name : 'Tanpa kategori',
    location: typeof product.location === 'string' ? product.location : null,
    baseUnit: typeof product.baseUnit === 'string' ? product.baseUnit : 'pcs',
    salePrice,
    minimumDiscountPercent,
    maximumDiscountPercent,
    minimumStock,
    balance,
    stockStatus,
    units,
  }
}

export function createSnapshot(
  storeKey: string,
  products: Product[],
  updatedAt = new Date().toISOString(),
): InventorySnapshot {
  if (!storeKey.trim()) throw new TypeError('storeKey snapshot wajib diisi')
  const parsedDate = new Date(updatedAt)
  if (Number.isNaN(parsedDate.valueOf())) throw new TypeError('updatedAt snapshot harus berupa tanggal ISO')
  return {
    version: SNAPSHOT_VERSION,
    storeKey,
    updatedAt: parsedDate.toISOString(),
    products: products.map(sanitizeProduct),
  }
}

export function isInventorySnapshot(value: unknown): value is InventorySnapshot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<InventorySnapshot>
  return (
    candidate.version === SNAPSHOT_VERSION &&
    typeof candidate.storeKey === 'string' &&
    candidate.storeKey.length > 0 &&
    typeof candidate.updatedAt === 'string' &&
    !Number.isNaN(new Date(candidate.updatedAt).valueOf()) &&
    Array.isArray(candidate.products) &&
    candidate.products.every(isOfflineProduct)
  )
}

function isOfflineProduct(value: unknown): value is OfflineProduct {
  if (!value || typeof value !== 'object') return false
  const product = value as Partial<OfflineProduct>
  return (
    typeof product.id === 'string' &&
    typeof product.sku === 'string' &&
    typeof product.name === 'string' &&
    typeof product.category === 'string' &&
    (typeof product.location === 'string' || product.location === null) &&
    typeof product.baseUnit === 'string' &&
    typeof product.salePrice === 'number' &&
    typeof product.minimumDiscountPercent === 'number' &&
    typeof product.maximumDiscountPercent === 'number' &&
    typeof product.minimumStock === 'number' &&
    typeof product.balance === 'number' &&
    (product.stockStatus === 'OUT_OF_STOCK' || product.stockStatus === 'LOW' || product.stockStatus === 'OK') &&
    Array.isArray(product.units)
  )
}
