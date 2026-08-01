import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'TypeType',
        short_name: 'TypeType',
        description: 'Type the equation back exactly, as fast as you can. Climb the ladder from Easy to Boss.',
        // Warm cream/coral theme (matches src/lib/theme.ts) — replaces the
        // old dark "Digit Dash" splash colors so the install/boot experience
        // matches the redesigned in-game look instead of flashing near-black.
        theme_color: '#FF6B6B',
        background_color: '#FFF8F0',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,mp3}'],
        // Workbox's default precache limit is 2MB — the menu music track is
        // ~2.9MB, so without raising this it gets silently skipped (build
        // warning only, no hard error) and falls back to a network fetch
        // every time instead of being available offline.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Never cache API calls to Supabase — always go to network for leaderboard/auth
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
