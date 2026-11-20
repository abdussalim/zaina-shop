import { Hono } from 'hono'
import { z } from 'zod'
import { categoryInputSchema, productInputSchema } from '@zaina/shared'
import type { Env } from '../env.js'
import { sendData } from '../http/respond.js'
import { requireAuth } from '../middleware/auth.js'
import { createD1Database } from '../db/d1.js'
import { createCatalogService } from '../modules/catalog/catalog.service.js'

export const catalogRoutes = new Hono<Env>()

catalogRoutes.use('*', requireAuth)

catalogRoutes.get('/categories', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createCatalogService(db)
  return sendData(c, await service.listCategories())
})

catalogRoutes.post('/categories', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createCatalogService(db)
  const body = await c.req.json().catch(() => ({}))
  const input = categoryInputSchema.parse(body)
  return sendData(c, await service.createCategory(input), 201)
})

catalogRoutes.get('/products', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createCatalogService(db)

  const queryParams = c.req.query()
  const stockStatus = z
    .enum(['OUT_OF_STOCK', 'LOW', 'OK'])
    .optional()
    .parse(queryParams.stockStatus)

  const products = await service.listProducts({
    includeInactive: queryParams.includeInactive === 'true',
    ...(typeof queryParams.q === 'string' && queryParams.q.trim()
      ? { query: queryParams.q.trim() }
      : {}),
    ...(typeof queryParams.categoryId === 'string'
      ? { categoryId: z.string().uuid().parse(queryParams.categoryId) }
      : {}),
    ...(stockStatus ? { stockStatus } : {}),
  })

  return sendData(c, products)
})

catalogRoutes.post('/products', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createCatalogService(db)
  const body = await c.req.json().catch(() => ({}))
  const input = productInputSchema.parse(body)
  return sendData(c, await service.createProduct(input), 201)
})

catalogRoutes.get('/products/:id', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createCatalogService(db)
  const id = z.string().uuid().parse(c.req.param('id'))
  return sendData(c, await service.getProduct(id))
})

catalogRoutes.patch('/products/:id', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createCatalogService(db)
  const id = z.string().uuid().parse(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const input = productInputSchema.parse(body)
  return sendData(c, await service.updateProduct(id, input))
})

catalogRoutes.post('/products/:id/archive', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createCatalogService(db)
  const id = z.string().uuid().parse(c.req.param('id'))
  return sendData(c, await service.archiveProduct(id))
})
