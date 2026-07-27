import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const productionApiHosts = new Set([
  'bondiari.com',
  'www.bondiari.com',
  'bondiari.sergicas.workers.dev',
])

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

function getApiTarget(mode) {
  const env = loadEnv(mode, rootDir, '')
  const target = env.BONDIARI_API_TARGET?.trim() || 'http://127.0.0.1:8787'
  let targetUrl

  try {
    targetUrl = new URL(target)
  } catch {
    throw new Error(
      `BONDIARI_API_TARGET ha de ser una URL HTTP(S) vàlida; valor rebut: ${target}`,
    )
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    throw new Error('BONDIARI_API_TARGET només admet els protocols HTTP i HTTPS.')
  }

  if (
    productionApiHosts.has(targetUrl.hostname) &&
    env.BONDIARI_ALLOW_PRODUCTION_API !== '1'
  ) {
    throw new Error(
      'El servidor de desenvolupament no pot apuntar a producció sense BONDIARI_ALLOW_PRODUCTION_API=1.',
    )
  }

  return target
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const apiTarget = getApiTarget(mode)

  return {
    // Les crides del client van al Worker local per defecte. Producció
    // requereix una acceptació explícita per evitar escriptures accidentals.
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: apiTarget.startsWith('https://'),
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
  }
})
