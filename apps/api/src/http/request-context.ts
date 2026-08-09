import { randomUUID } from 'node:crypto'

import type { RequestHandler } from 'express'

export const requestContext: RequestHandler = (request, response, next) => {
  const incomingId = request.header('x-request-id')
  request.id = incomingId && incomingId.length <= 100 ? incomingId : randomUUID()
  response.setHeader('x-request-id', request.id)
  next()
}
