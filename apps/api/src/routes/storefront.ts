import { Hono } from 'hono'
import type { Env } from '../env.js'
import { sendData } from '../http/respond.js'
import { createD1Database } from '../db/d1.js'
import { createSettingsService } from '../modules/settings/settings.service.js'
import { createCatalogService } from '../modules/catalog/catalog.service.js'

export const storefrontRoutes = new Hono<Env>()

storefrontRoutes.get('/info', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createSettingsService(db)
  const store = await service.getStore()

  return sendData(c, {
    storeName: store.storeName,
    address: store.address ?? '',
    phone: store.phone ?? '',
  })
})

storefrontRoutes.get('/catalog', async (c) => {
  const db = createD1Database(c.env.DB)
  const catalogService = createCatalogService(db)

  const [categories, allProducts] = await Promise.all([
    catalogService.listCategories(),
    catalogService.listProducts({ includeInactive: false }),
  ])

  const sanitizedProducts = allProducts.map((p) => ({
    id: p.id,
    name: p.name,
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? (p as any).categoryName,
    categoryColor: p.category?.color ?? (p as any).categoryColor,
    baseUnit: p.baseUnit,
    imageUrl: p.imageUrl,
    stockStatus: p.stockStatus,
    units: p.units.map((u) => ({
      id: u.id,
      name: u.name,
      factor: u.factor,
      salePrice: u.salePrice,
      isDefault: u.isDefault,
    })),
  }))

  return sendData(c, {
    categories,
    products: sanitizedProducts,
  })
})
