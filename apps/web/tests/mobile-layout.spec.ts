import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk kembali' } }) }))
})

test('has no horizontal overflow and keeps interactive controls touch sized', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Masuk ke ruang toko' })).toBeVisible()
  const metrics = await page.evaluate(() => {
    const controls = [...document.querySelectorAll<HTMLElement>('button, input, select, textarea, a')]
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      minInteractiveHeight: Math.min(...controls.map((element) => element.getBoundingClientRect().height).filter((height) => height > 0)),
    }
  })
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  expect(metrics.minInteractiveHeight).toBeGreaterThanOrEqual(48)
})
