import { Hono } from 'hono'
import { z } from 'zod'
import { movementTypeSchema, stockMovementInputSchema } from '@zaina/shared'
import type { Env } from '../env.js'
import { sendData } from '../http/respond.js'
import { requireAuth } from '../middleware/auth.js'
import { createD1Database } from '../db/d1.js'
import { createInventoryService } from '../modules/inventory/inventory.service.js'

const ledgerMovementTypeSchema = z.enum([
  ...movementTypeSchema.options,
  'SALE',
  'SALE_REVERSAL',
])

export const inventoryRoutes = new Hono<Env>()

inventoryRoutes.use('*', requireAuth)

inventoryRoutes.post('/inventory/movements', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createInventoryService(db)
  const user = c.get('user')!

  const body = await c.req.json().catch(() => ({}))
  const input = stockMovementInputSchema.parse(body)

  const result = await service.recordMovement(input, user.id)
  return sendData(c, result.movement, result.created ? 201 : 200)
})

inventoryRoutes.get('/inventory/movements', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createInventoryService(db)

  const queryParams = c.req.query()
  const productId = z.string().uuid().optional().parse(queryParams.productId)
  const type = ledgerMovementTypeSchema.optional().parse(queryParams.type)
  const cursor = z.string().uuid().optional().parse(queryParams.cursor)
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(250)
    .default(100)
    .parse(queryParams.limit)

  const data = await service.listMovements({
    limit,
    ...(productId ? { productId } : {}),
    ...(type ? { type } : {}),
    ...(cursor ? { cursor } : {}),
  })

  return sendData(c, data)
})

inventoryRoutes.get('/inventory/summary', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createInventoryService(db)
  return sendData(c, await service.getSummary())
})
