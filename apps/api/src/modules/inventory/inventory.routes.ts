import { Router } from 'express'
import { movementTypeSchema, stockMovementInputSchema } from '@zaina/shared'
import { z } from 'zod'

import { sendData } from '../../http/respond.js'
import { requireSession } from '../auth/auth.routes.js'
import type { createInventoryService } from './inventory.service.js'

type InventoryService = ReturnType<typeof createInventoryService>
const ledgerMovementTypeSchema = z.enum([
  ...movementTypeSchema.options,
  'SALE',
  'SALE_REVERSAL',
])

export function createInventoryRouter(service: InventoryService): Router {
  const router = Router()
  router.use(requireSession)

  router.post('/inventory/movements', async (request, response) => {
    const result = await service.recordMovement(
      stockMovementInputSchema.parse(request.body),
      request.session.user!.id,
    )
    return sendData(response, result.movement, result.created ? 201 : 200)
  })

  router.get('/inventory/movements', async (request, response) => {
    const productId = z.uuid().optional().parse(request.query.productId)
    const type = ledgerMovementTypeSchema.optional().parse(request.query.type)
    const cursor = z.uuid().optional().parse(request.query.cursor)
    const limit = z.coerce.number().int().min(1).max(250).default(100).parse(request.query.limit)
    return sendData(
      response,
      await service.listMovements({
        limit,
        ...(productId ? { productId } : {}),
        ...(type ? { type } : {}),
        ...(cursor ? { cursor } : {}),
      }),
    )
  })

  router.get('/inventory/summary', async (_request, response) =>
    sendData(response, await service.getSummary()),
  )

  return router
}
