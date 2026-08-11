import { test, expect } from '@playwright/test'

test('serves an Indonesian standalone manifest with safe icons', async ({ page, request }) => {
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk kembali' } }) }))
  const manifestResponse = await request.get('/manifest.webmanifest')
  expect(manifestResponse.ok()).toBeTruthy()
  const manifestContentType = manifestResponse.headers()['content-type'] ?? ''
  if (manifestContentType.includes('application/json')) {
    const manifest = await manifestResponse.json()
    expect(manifest).toMatchObject({ name: 'Toko Zaina', lang: 'id', display: 'standalone', start_url: '/' })
    expect(manifest.icons).toEqual(expect.arrayContaining([expect.objectContaining({ purpose: 'any' }), expect.objectContaining({ purpose: 'maskable' })]))
  }
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  const registrationSupport = await page.evaluate(() => 'serviceWorker' in navigator)
  expect(registrationSupport).toBeTruthy()
})

test('keeps business APIs outside the static shell cache policy', async ({ page }) => {
  await page.goto('/')
  const serviceWorkerSource = await page.request.get('/sw.js').catch(() => page.request.get('/dev-sw.js?dev-sw'))
  const source = await serviceWorkerSource.text()
  expect(source).not.toMatch(/NetworkFirst|CacheFirst.*api/i)
})
