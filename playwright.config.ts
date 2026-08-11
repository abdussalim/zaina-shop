import { defineConfig } from '@playwright/test'

const viewports = [320, 360, 430, 768, 1024, 1366]

export default defineConfig({
  testDir: './apps/web/tests',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } } : {}),
  },
  projects: viewports.map((width) => ({
    name: `viewport-${width}`,
    use: { viewport: { width, height: width < 769 ? 844 : 900 } },
  })),
  webServer: {
    command: 'npm.cmd run dev --workspace @zaina/web',
    url: 'http://127.0.0.1:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
