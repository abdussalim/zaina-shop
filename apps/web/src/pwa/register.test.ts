import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerServiceWorker, requestServiceWorkerUpdate } from './register.js'

describe('service worker registration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('is a no-op when service workers are unavailable', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined })
    await expect(registerServiceWorker()).resolves.toBeUndefined()
    if (original) Object.defineProperty(navigator, 'serviceWorker', original)
  })

  it('registers the production worker and can request a deferred update', async () => {
    vi.stubEnv('PROD', true)
    const waiting = { postMessage: vi.fn() }
    const registration = {
      waiting,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as ServiceWorkerRegistration
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register: vi.fn().mockResolvedValue(registration), controller: null },
    })
    const result = await registerServiceWorker()
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
    expect(result).toBe(registration)
    requestServiceWorkerUpdate(registration)
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('surfaces an already-waiting service worker when a controller is active', async () => {
    vi.stubEnv('PROD', true)
    const waiting = { postMessage: vi.fn() }
    const registration = {
      waiting,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as ServiceWorkerRegistration
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn().mockResolvedValue(registration),
        controller: {} as ServiceWorker,
      },
    })

    const onNeedRefresh = vi.fn()
    await registerServiceWorker({ onNeedRefresh })

    expect(onNeedRefresh).toHaveBeenCalledTimes(1)
    expect(onNeedRefresh).toHaveBeenCalledWith(registration)
  })

  it('checks for updates when the document becomes visible', async () => {
    vi.stubEnv('PROD', true)
    const update = vi.fn().mockResolvedValue(undefined)
    const registration = {
      waiting: null,
      installing: null,
      addEventListener: vi.fn(),
      update,
    } as unknown as ServiceWorkerRegistration
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register: vi.fn().mockResolvedValue(registration), controller: null },
    })

    await registerServiceWorker()

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(update).not.toHaveBeenCalled()

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(update).toHaveBeenCalledTimes(1)
  })
})
