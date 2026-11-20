import { Hono } from 'hono'
import { ZodError } from 'zod'
import type { Env } from './env.js'
import { AppError, zodFields } from './http/errors.js'
import { sendData } from './http/respond.js'
import { sessionMiddleware } from './middleware/auth.js'
import { authRoutes } from './routes/auth.js'
import { uploadRoutes } from './routes/upload.js'
import { imagesRoutes } from './routes/images.js'
import { catalogRoutes } from './routes/catalog.js'
import { inventoryRoutes } from './routes/inventory.js'
import { salesRoutes } from './routes/sales.js'
import { reportsRoutes } from './routes/reports.js'
import { settingsRoutes } from './routes/settings.js'

const app = new Hono<Env>()

// Request ID and logging middleware
app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') || crypto.randomUUID()
  c.set('requestId', requestId)
  c.header('x-request-id', requestId)
  await next()
})

// Session cookie authentication middleware
app.use('*', sessionMiddleware)

// Health check
app.get('/api/v1/health', (c) => {
  return sendData(c, { status: 'ok' })
})

// Sub-routers mounted on /api/v1
app.route('/api/v1/auth', authRoutes)
app.route('/api/v1/upload', uploadRoutes)
app.route('/api/v1/images', imagesRoutes)
app.route('/api/v1', catalogRoutes)
app.route('/api/v1', inventoryRoutes)
app.route('/api/v1', salesRoutes)
app.route('/api/v1', reportsRoutes)
app.route('/api/v1', settingsRoutes)

// Custom 404 for unmatched /api/* routes
app.all('/api/*', (c) => {
  const requestId = c.get('requestId')
  return c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'Alamat API tidak ditemukan',
        requestId,
      },
    },
    404,
  )
})

// Error handler
app.onError((err, c) => {
  const requestId = c.get('requestId') || crypto.randomUUID()

  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data yang dikirim belum valid',
          fields: zodFields(err),
          requestId,
        },
      },
      422,
    )
  }

  if (err instanceof AppError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          fields: err.fields,
          requestId,
        },
      },
      err.status as any,
    )
  }

  console.error('Unhandled error:', err)
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Terjadi kesalahan pada server',
        requestId,
      },
    },
    500,
  )
})

// Fallback to static assets for Cloudflare Pages SPA
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw)
  }
  return c.text('Not found', 404)
})

export default app
