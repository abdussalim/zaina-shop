import { Hono } from 'hono'
import type { Env } from '../env.js'

export const imagesRoutes = new Hono<Env>()

imagesRoutes.get('/*', async (c) => {
  if (!c.env.IMAGES) {
    return c.text('R2 Storage not configured', 500)
  }

  // Extract key after /api/v1/images/
  const url = new URL(c.req.url)
  const key = url.pathname.replace(/^\/api\/v1\/images\//, '')
  if (!key) {
    return c.text('Image key missing', 400)
  }

  const object = await c.env.IMAGES.get(key)
  if (!object) {
    return c.text('Image not found', 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers as any)
  headers.set('etag', object.httpEtag)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')

  return new Response(object.body as any, {
    headers,
  })
})
