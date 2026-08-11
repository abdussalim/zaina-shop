export interface ServiceWorkerLifecycle {
  onNeedRefresh?: (registration: ServiceWorkerRegistration) => void
  onOfflineReady?: () => void
}

export async function registerServiceWorker(
  lifecycle: ServiceWorkerLifecycle = {},
): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return undefined
  if (!import.meta.env.PROD) return undefined
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing
    if (!worker) return
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        if (navigator.serviceWorker.controller) lifecycle.onNeedRefresh?.(registration)
        else lifecycle.onOfflineReady?.()
      }
    })
  })
  return registration
}

export function requestServiceWorkerUpdate(registration: ServiceWorkerRegistration) {
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
}
