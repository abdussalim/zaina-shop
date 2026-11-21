export interface StorefrontProductUnit {
  id: string
  name: string
  factor: number
  salePrice: number
  isDefault: boolean
}

export interface StorefrontProduct {
  id: string
  name: string
  categoryId: string
  categoryName: string
  categoryColor: string
  baseUnit: string
  imageUrl: string | null
  stockStatus: 'OK' | 'LOW' | 'OUT_OF_STOCK'
  units: StorefrontProductUnit[]
}

export interface StorefrontCategory {
  id: string
  name: string
  color: string
  isActive: boolean
}

export interface StorefrontCatalogResponse {
  categories: StorefrontCategory[]
  products: StorefrontProduct[]
}

export interface StorefrontInfo {
  storeName: string
  address: string
  phone: string
}

export interface CartItem {
  productId: string
  productName: string
  unitId: string
  unitName: string
  unitPrice: number
  quantity: number
  imageUrl: string | null
}
