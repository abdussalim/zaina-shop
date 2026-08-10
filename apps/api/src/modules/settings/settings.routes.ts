import { Router } from 'express'
import { passwordChangeInputSchema, storeSettingsInputSchema } from '@zaina/shared'

import { sendData } from '../../http/respond.js'
import { requireSession } from '../auth/auth.routes.js'
import type { createSettingsService } from './settings.service.js'

type SettingsService = ReturnType<typeof createSettingsService>

export function createSettingsRouter(service: SettingsService): Router {
  const router = Router()
  router.use(requireSession)

  router.get('/settings/store', async (_request, response) =>
    sendData(response, await service.getStore()),
  )
  router.patch('/settings/store', async (request, response) =>
    sendData(response, await service.updateStore(storeSettingsInputSchema.parse(request.body))),
  )
  router.post('/settings/password', async (request, response) => {
    await service.changePassword(
      request.session.user!.id,
      passwordChangeInputSchema.parse(request.body),
    )
    response.status(204).end()
  })

  return router
}
