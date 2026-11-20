import { Hono } from 'hono'
import type { Env } from '../env.js'
import { AppError } from '../http/errors.js'
import { sendData } from '../http/respond.js'
import { requireAuth } from '../middleware/auth.js'

export const uploadRoutes = new Hono<Env>()

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

uploadRoutes.post('/image', requireAuth, async (c) => {
  if (!c.env.IMAGES) {
    throw new AppError(
      500,
      'R2_NOT_CONFIGURED',
      'Penyimpanan Cloudflare R2 belum terhubung atau belum diaktifkan',
    )
  }

  const formData = await c.req.formData().catch(() => null)
  if (!formData) {
    throw new AppError(400, 'INVALID_FORM', 'Data form tidak valid')
  }

  const file = formData.get('image') || formData.get('file')
  if (!file || typeof file === 'string') {
    throw new AppError(400, 'NO_FILE', 'File gambar wajib dipilih')
  }

  const mimeType = file.type.toLowerCase()
  const ext = ALLOWED_TYPES[mimeType]
  if (!ext) {
    throw new AppError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Format gambar harus berupa JPG, PNG, WEBP, atau GIF',
    )
  }

  if (file.size > MAX_SIZE) {
    throw new AppError(
      413,
      'FILE_TOO_LARGE',
      'Ukuran file gambar maksimal 5 MB',
    )
  }

  const key = `products/${crypto.randomUUID()}${ext}`
  const arrayBuffer = await file.arrayBuffer()

  await c.env.IMAGES.put(key, arrayBuffer, {
    httpMetadata: {
      contentType: mimeType,
    },
  })

  return sendData(c, { url: `/api/v1/images/${key}` }, 201)
})
