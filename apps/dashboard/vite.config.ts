import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Permite apontar o frontend para um backend isolado (ex.: E2E em :8020) ou harmonizado.
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000';
const brainProxyTarget = process.env.VITE_BRAIN_PROXY_TARGET || 'http://127.0.0.1:3001';
const brainWsTarget = process.env.VITE_BRAIN_WS_TARGET || 'ws://127.0.0.1:3001';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'qrcode', 'lucide-react'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icon.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png',
      ],
      manifest: {
        id: '/',
        name: 'JARVIS AI Hub',
        short_name: 'JARVIS Hub',
        description:
          'Sistema Operacional Pessoal Multi-Agente com Voz, Escritório Vivo, IDE Integrada, Sentinela SOC e Desktop Companion.',
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api/v1/brain': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/spreadsheets': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/media': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/app-builder': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/apps': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/android-app': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/workflows': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/office': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/devices': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/companion': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/push': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/ide': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/github': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/models/hardware': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/api/v1/integrations': {
        target: brainProxyTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: brainWsTarget,
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
