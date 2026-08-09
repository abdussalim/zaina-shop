import { Router } from 'express'
import { categoryInputSchema, productInputSchema } from '@zaina/shared'
import { z } from 'zod'

import { sendData } from '../../http/respond.js'
import { requireSession } from '../auth/auth.routes.js'
import type { createCatalogService } from './catalog.service.js'

type CatalogService = ReturnType<typeof createCatalogService>

export function createCatalogRouter(service: CatalogService): Router {
  const router = Router()
  router.use(requireSession)

  router.get('/categories', async (_request, response) =>
    sendData(response, await service.listCategories()),
  )
  router.post('/categories', async (request, response) =>
    sendData(response, await service.createCategory(categoryInputSchema.parse(request.body)), 201),
  )

  router.get('/products', async (request, response) => {
    const stockStatus = z
      .enum(['OUT_OF_STOCK', 'LOW', 'OK'])
      .optional()
      .parse(request.query.stockStatus)
    const products = await service.listProducts({
      includeInactive: request.query.includeInactive === 'true',
      ...(typeof request.query.q === 'string' && request.query.q.trim()
        ? { query: request.query.q.trim() }
        : {}),
      ...(typeof request.query.categoryId === 'string'
        ? { categoryId: z.uuid().parse(request.query.categoryId) }
        : {}),
      ...(stockStatus ? { stockStatus } : {}),
    })
    return sendData(response, products)
  })
  router.post('/products', async (request, response) =>
    sendData(response, await service.createProduct(productInputSchema.parse(request.body)), 201),
  )
  router.get('/products/:id', async (request, response) =>
    sendData(response, await service.getProduct(z.uuid().parse(request.params.id))),
  )
  router.patch('/products/:id', async (request, response) =>
    sendData(
      response,
      await service.updateProduct(
        z.uuid().parse(request.params.id),
        productInputSchema.parse(request.body),
      ),
    ),
  )
  router.post('/products/:id/archive', async (request, response) =>
    sendData(
      response,
      await service.archiveProduct(z.uuid().parse(request.params.id)),
    ),
  )

  return router
}
