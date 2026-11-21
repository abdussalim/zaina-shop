import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 60_000,
    restoreMocks: true,
    clearMocks: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/db/migrate.test.ts',
      'src/db/seed.test.ts',
      'src/db/postgres.integration.test.ts',
      'src/modules/auth/auth.routes.test.ts',
      'src/modules/catalog/catalog.routes.test.ts',
      'src/modules/inventory/inventory.routes.test.ts',
      'src/modules/reports/reports.routes.test.ts',
      'src/modules/sales/sales.routes.test.ts',
      'src/modules/settings/settings.routes.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
