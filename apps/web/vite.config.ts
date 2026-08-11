import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.ts',
      includeAssets: ['icons/icon.svg', 'icons/maskable-icon.svg'],
      manifest: {
        name: 'Toko Zaina',
        short_name: 'Zaina',
        lang: 'id',
        start_url: '/',
        display: 'standalone',
        theme_color: '#626a45',
        background_color: '#f4f0e7',
        icons: [
          { src: 'icons/icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/maskable-icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
      devOptions: { enabled: false },
    }),
  ],
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
    exclude: ['tests/**'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
