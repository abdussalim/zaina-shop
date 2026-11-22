/// <reference lib="webworker" />

import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim, type WorkboxPlugin } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope & typeof globalThis & { __WB_MANIFEST: any }

function createCachePlugins(maxEntries: number, maxAgeSeconds: number): WorkboxPlugin[] {
  return [
    // Workbox plugin classes type optional lifecycle hooks with `| undefined`,
    // which conflicts with `exactOptionalPropertyTypes: true` on `WorkboxPlugin`.
    new CacheableResponsePlugin({ statuses: [0, 200] }) as WorkboxPlugin,
    new ExpirationPlugin({ maxEntries, maxAgeSeconds }) as WorkboxPlugin,
  ]
}

clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

const navigationHandler = createHandlerBoundToURL('/index.html')
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api\//, /^\/assets\//],
  }),
)

registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    (url.pathname === '/api/v1/storefront' || url.pathname.startsWith('/api/v1/storefront/')),
  new NetworkFirst({
    cacheName: 'storefront-api',
    networkTimeoutSeconds: 4,
    plugins: createCachePlugins(20, 60 * 60 * 24),
  }),
)

registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    url.pathname.startsWith('/api/v1/images/'),
  new CacheFirst({
    cacheName: 'product-images',
    plugins: createCachePlugins(120, 60 * 60 * 24 * 14),
  }),
)

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
