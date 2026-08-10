export interface Category {
  id: string
  name: string
  color: string
  isActive?: boolean
}

export interface ProductUnit {
  id: string
  name: string
  factor: number
  salePrice: number
  isDefault: boolean
}

export interface Product {
  id: string
  categoryId: string
  category: Category
  sku: string
  barcode: string | null
  name: string
  location: string | null
  baseUnit: string
  costPrice: number
  salePrice: number
  minimumStock: number
  imageUrl: string | null
  isActive: boolean
  balanceBase: number
  stockStatus: 'OUT_OF_STOCK' | 'LOW' | 'OK'
  units: ProductUnit[]
}

export interface StockMovement {
  id: string
  productId: string
  productName: string
  unitId: string
  unitName: string
  type: string
  quantityInput: number
  factorSnapshot: number
  quantityBase: number
  newBalance: number
  unitCost: number | null
  referenceId: string | null
  note: string | null
  createdAt: string
}

export interface SaleItem {
  id: string
  productId: string
  unitId: string
  productName: string
  unitName: string
  factorSnapshot: number
  quantityInput: number
  quantityBase: number
  unitPrice: number
  costPrice: number
  subtotal: number
}

export interface Sale {
  id: string
  saleNumber: string
  soldAt: string
  status: 'COMPLETED' | 'CANCELLED'
  subtotal: number
  discount: number
  total: number
  amountPaid: number
  changeAmount: number
  note: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  items?: SaleItem[]
}

export interface DashboardData {
  salesToday: number
  revenueToday: number
  profitToday: number
  totalProducts: number
  inventoryValue: number
  lowStockCount: number
  outOfStockCount: number
  recentSales: Pick<Sale, 'id' | 'saleNumber' | 'soldAt' | 'total' | 'status'>[]
  recentMovements: Pick<
    StockMovement,
    'id' | 'productName' | 'type' | 'quantityBase' | 'createdAt'
  >[]
  lowStockProducts: Pick<
    Product,
    'id' | 'sku' | 'name' | 'baseUnit' | 'balanceBase' | 'minimumStock'
  >[]
}

export interface SalesReport {
  filters: { from?: string; to?: string }
  summary: {
    transactionCount: number
    grossSales: number
    discounts: number
    netSales: number
    costOfGoods: number
    grossProfit: number
  }
  topProducts: {
    productId: string
    productName: string
    quantityBase: number
    revenue: number
    cost: number
    grossProfit: number
  }[]
  transactions: Pick<Sale, 'id' | 'saleNumber' | 'soldAt' | 'subtotal' | 'discount' | 'total'>[]
}

export interface InventoryReport {
  summary: {
    totalProducts: number
    inventoryValue: number
    lowStockCount: number
    outOfStockCount: number
  }
  products: {
    id: string
    sku: string
    name: string
    categoryName: string
    location: string | null
    baseUnit: string
    costPrice: number
    salePrice: number
    minimumStock: number
    balanceBase: number
    inventoryValue: number
    stockStatus: Product['stockStatus']
  }[]
}

export interface StoreSettings {
  storeName: string
  address: string | null
  phone: string | null
  timezone: 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura'
  defaultMinimumStock: number
}
