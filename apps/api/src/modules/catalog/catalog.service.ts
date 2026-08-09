import type { CategoryInput, ProductInput } from '@zaina/shared'

import type { Database } from '../../db/database.js'
import { AppError } from '../../http/errors.js'
import {
  findProduct,
  findProducts,
  listCategories,
  type ProductListFilters,
} from './catalog.queries.js'
import {
  archiveProductRecord,
  insertCategory,
  insertProduct,
  updateProductRecord,
} from './catalog.repository.js'

export function createCatalogService(database: Database) {
  return {
    listCategories: () => listCategories(database),
    async createCategory(input: CategoryInput) {
      try {
        return await insertCategory(database, input)
      } catch (error) {
        throw mapConstraintError(error)
      }
    },
    listProducts: (filters: ProductListFilters) => findProducts(database, filters),
    async getProduct(productId: string) {
      const product = await findProduct(database, productId)
      if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Barang tidak ditemukan')
      return product
    },
    async createProduct(input: ProductInput) {
      try {
        const productId = await insertProduct(database, input)
        return await this.getProduct(productId)
      } catch (error) {
        throw mapConstraintError(error)
      }
    },
    async updateProduct(productId: string, input: ProductInput) {
      try {
        const updated = await updateProductRecord(database, productId, input)
        if (!updated) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Barang tidak ditemukan')
        return await this.getProduct(productId)
      } catch (error) {
        throw mapConstraintError(error)
      }
    },
    async archiveProduct(productId: string) {
      const archived = await archiveProductRecord(database, productId)
      if (!archived) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Barang tidak ditemukan')
      return await this.getProduct(productId)
    },
  }
}

function mapConstraintError(error: unknown): Error {
  if (error instanceof AppError) return error
  const databaseError = error as { code?: string; constraint?: string }
  if (databaseError.code === '23505') {
    const isProductCode =
      databaseError.constraint?.includes('products_sku') ||
      databaseError.constraint?.includes('products_barcode')
    return new AppError(
      409,
      isProductCode ? 'DUPLICATE_PRODUCT_CODE' : 'DUPLICATE_CATALOG_VALUE',
      isProductCode
        ? 'SKU atau barcode sudah digunakan barang lain'
        : 'Data katalog tersebut sudah digunakan',
    )
  }
  return error instanceof Error ? error : new Error('Unknown catalog error')
}
