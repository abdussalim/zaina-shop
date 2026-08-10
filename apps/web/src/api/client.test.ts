import { describe, expect, it, vi } from 'vitest'

import { apiRequest, SESSION_EXPIRED_EVENT } from './client.js'

describe('apiRequest', () => {
  it('announces an expired operational session on a 401 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'UNAUTHORIZED', message: 'Silakan masuk kembali' },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const listener = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, listener)

    await expect(apiRequest('/api/v1/products')).rejects.toMatchObject({
      status: 401,
    })

    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
    vi.unstubAllGlobals()
  })

  it('does not announce an expired session for a rejected login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'INVALID_CREDENTIALS', message: 'Tidak sesuai' },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const listener = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, listener)

    await expect(apiRequest('/api/v1/auth/login')).rejects.toMatchObject({
      status: 401,
    })

    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
    vi.unstubAllGlobals()
  })
})
