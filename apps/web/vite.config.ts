import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    modulePreload: false,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
