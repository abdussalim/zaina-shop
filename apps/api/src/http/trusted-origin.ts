import type { RequestHandler } from 'express'

import { AppError } from './errors.js'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

export function trustedOrigin(appOrigin: string): RequestHandler {
  return (request, _response, next) => {
    const origin = request.header('origin')
    if (safeMethods.has(request.method) || !origin || origin === appOrigin) {
      next()
      return
    }

    next(new AppError(403, 'UNTRUSTED_ORIGIN', 'Asal permintaan tidak diizinkan'))
  }
}
