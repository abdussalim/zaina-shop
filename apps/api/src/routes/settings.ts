import { Hono } from 'hono'
import {
  passwordChangeInputSchema,
  storeSettingsInputSchema,
} from '@zaina/shared'
import type { Env } from '../env.js'
import { sendData } from '../http/respond.js'
import { requireAuth } from '../middleware/auth.js'
import { createD1Database } from '../db/d1.js'
import { createSettingsService } from '../modules/settings/settings.service.js'

export const settingsRoutes = new Hono<Env>()

settingsRoutes.use('*', requireAuth)

settingsRoutes.get('/settings/store', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createSettingsService(db)
  return sendData(c, await service.getStore())
})

settingsRoutes.patch('/settings/store', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createSettingsService(db)
  const body = await c.req.json().catch(() => ({}))
  const input = storeSettingsInputSchema.parse(body)
  return sendData(c, await service.updateStore(input))
})

settingsRoutes.post('/settings/password', async (c) => {
  const db = createD1Database(c.env.DB)
  const service = createSettingsService(db)
  const user = c.get('user')!

  const body = await c.req.json().catch(() => ({}))
  const input = passwordChangeInputSchema.parse(body)

  await service.changePassword(user.id, input)
  return c.body(null, 204)
})
