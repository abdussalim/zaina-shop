import { Hono } from 'hono'
import { z } from 'zod'
import { saleInputSchema } from '@zaina/shared'
import type { Env } from '../env.js'
import { sendData } from '../http/respond.js'
import { parseDateFilters } from '../http/date-range.js'
import { requireAuth } from '../middleware/auth.js'
import { createD1Database } from '../db/d1.js'
import { createSalesService } from '../modules/sales/sales.service.js'

const cancellationSchema = z.object({
  reason: z.string().trim().min(3).max(500),
})

export const salesRoutes = new Hono<Env>()

salesRoutes.use('*', requireAuth)

salesRoutes.post('/sales', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createSalesService(db, 'Asia/Jakarta')
  const user = c.get('user')!

  const body = await c.req.json().catch(() => ({}))
  const input = saleInputSchema.parse(body)

  const result = await service.completeSale(input, user.id)
  return sendData(c, result.sale, result.created ? 201 : 200)
})

salesRoutes.get('/sales', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createSalesService(db, 'Asia/Jakarta')

  const queryParams = c.req.query()
  const status = z
    .enum(['COMPLETED', 'CANCELLED'])
    .optional()
    .parse(queryParams.status)
  const { from, to } = parseDateFilters(queryParams)
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(250)
    .default(100)
    .parse(queryParams.limit)

  const data = await service.list({
    limit,
    ...(status ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  })

  return sendData(c, data)
})

salesRoutes.get('/sales/:id', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createSalesService(db, 'Asia/Jakarta')
  const id = z.string().uuid().parse(c.req.param('id'))
  return sendData(c, await service.get(id))
})

salesRoutes.post('/sales/:id/cancel', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createSalesService(db, 'Asia/Jakarta')
  const user = c.get('user')!

  const id = z.string().uuid().parse(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const { reason } = cancellationSchema.parse(body)

  const data = await service.cancel(id, reason, user.id)
  return sendData(c, data)
})
