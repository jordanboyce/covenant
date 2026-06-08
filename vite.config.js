import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  preview: { allowedHosts: ['host.docker.internal', 'localhost'] },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Covenant — Offline Scriptures',
        short_name: 'Covenant',
        description: 'Read the scriptures and Come, Follow Me offline.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        // Precache the app shell + the small navigation/hymn data (so the table
        // of contents and hymns work offline immediately). The big per-page text
        // files and the PDFs are cached on first use instead.
        globPatterns: ['**/*.{js,mjs,css,html,ico,svg,woff2}', 'search/nav.json', 'search/hymns.json'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallbackDenylist: [/\.pdf$/i, /^\/search\//],
        runtimeCaching: [
          {
            // PDFs: cache on first open, then available fully offline.
            urlPattern: /\/pdfs\/.*\.pdf$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'covenant-pdfs',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            // Per-page search text: large, so loaded on demand and cached for
            // offline once a search has run.
            urlPattern: /\/search\/pages-.*\.json$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'covenant-search',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ]
})
