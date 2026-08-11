import type { Product, ProductUnit } from '../api/types.js'

export const SNAPSHOT_VERSION = 1 as const

export type OfflineStockStatus = Product['stockStatus']

export interface OfflineProductUnit {
  id: string
  name: string
  factor: number
  salePrice: number
  isDefault: boolean
  discountType: ProductUnit['discountType']
  minimumDiscount: number
  maximumDiscount: number
}

export interface OfflineProduct {
  id: string
  sku: string
  name: string
  category: string
  location: string | null
  baseUnit: string
  salePrice: number
  minimumDiscountPercent: number
  maximumDiscountPercent: number
  minimumStock: number
  balance: number
  stockStatus: OfflineStockStatus
  units: OfflineProductUnit[]
}

export interface InventorySnapshot {
  version: typeof SNAPSHOT_VERSION
  storeKey: string
  updatedAt: string
  products: OfflineProduct[]
}

export interface SnapshotStore {
  read(storeKey: string): Promise<InventorySnapshot | null>
  write(snapshot: InventorySnapshot): Promise<void>
  clear(storeKey: string): Promise<void>
  clearAll(): Promise<void>
}
