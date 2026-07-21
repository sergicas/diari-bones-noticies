import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

function stampServiceWorker() {
  return {
    name: 'stamp-sw-with-build-hash',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(rootDir, 'dist', 'sw.js')
      const assetsDir = resolve(rootDir, 'dist', 'assets')
      if (!existsSync(swPath) || !existsSync(assetsDir)) return
      const assetNames = readdirSync(assetsDir).sort().join(',')
      const hash = createHash('sha256').update(assetNames).digest('hex').slice(0, 12)
      const source = readFileSync(swPath, 'utf8')
      const stamped = source.replace(/__BUILD_HASH__/g, hash)
      writeFileSync(swPath, stamped, 'utf8')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // En `npm run dev`, el Worker no està actiu localment; redirigim les
  // crides /api/* al Worker desplegat perquè el front sí pugui llegir el feed.
  server: {
    proxy: {
      '/api': {
        target: 'https://bondiari.sergicas.workers.dev',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  // src/worker.js i src/server/ són codi de Cloudflare Workers; els exclou
  // del bundle del client perquè no els toqui vite.
  build: {
    rollupOptions: {
      external: (id) =>
        id.includes('/src/worker.js') || id.includes('/src/server/'),
    },
  },
  plugins: [
    react(),
    stampServiceWorker(),
    {
      // Per a Cloudflare Workers, el fallback SPA el cobreix
      // `not_found_handling: "single-page-application"` a wrangler.jsonc.
      // Ja no es copien _redirects ni .htaccess al dist.
      name: 'noop-fallback',
      closeBundle() {},
    },
  ],
})
