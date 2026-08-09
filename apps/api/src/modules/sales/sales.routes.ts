import { Router } from 'express'
import { saleInputSchema } from '@zaina/shared'
import { z } from 'zod'

import { sendData } from '../../http/respond.js'
import { requireSession } from '../auth/auth.routes.js'
import type { createSalesService } from './sales.service.js'

type SalesService = ReturnType<typeof createSalesService>

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const cancellationSchema = z.object({ reason: z.string().trim().min(3).max(500) })

export function createSalesRouter(service: SalesService): Router {
  const router = Router()
  router.use(requireSession)

  router.post('/sales', async (request, response) => {
    const result = await service.completeSale(
      saleInputSchema.parse(request.body),
      request.session.user!.id,
    )
    return sendData(response, result.sale, result.created ? 201 : 200)
  })

  router.get('/sales', async (request, response) => {
    const status = z.enum(['COMPLETED', 'CANCELLED']).optional().parse(request.query.status)
    const from = dateSchema.optional().parse(request.query.from)
    const to = dateSchema.optional().parse(request.query.to)
    const limit = z.coerce.number().int().min(1).max(250).default(100).parse(request.query.limit)
    return sendData(
      response,
      await service.list({
        limit,
        ...(status ? { status } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }),
    )
  })

  router.get('/sales/:id', async (request, response) =>
    sendData(response, await service.get(z.uuid().parse(request.params.id))),
  )

  router.post('/sales/:id/cancel', async (request, response) => {
    const { reason } = cancellationSchema.parse(request.body)
    return sendData(
      response,
      await service.cancel(
        z.uuid().parse(request.params.id),
        reason,
        request.session.user!.id,
      ),
    )
  })

  return router
}
