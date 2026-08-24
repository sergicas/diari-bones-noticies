#!/usr/bin/env node
// Refresc manual del radar de bondiari.com.
// Crida l'endpoint /api/refresh-news del Worker desplegat, força una nova
// passada de scraping + filtres + deduplicació contra l'historial d'URLs ja
// servides, i ensenya el resum del lot resultant.
//
// Ús: npm run refresh
//
// El cron de Cloudflare ja ho fa automàticament cada 4 hores; aquest script és
// per quan vols veure novetats abans de l'hora del cron.

import { esperaFeina, esperaLotVisible } from './lib/esperaRefresc.mjs'

const endpoint = process.env.BONDIARI_REFRESH_URL
  || 'https://bondiari.sergicas.workers.dev/api/refresh-news'
const liveNewsEndpoint = endpoint.replace('/api/refresh-news', '/api/live-news')
const refreshToken = process.env.BONDIARI_REFRESH_TOKEN

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('ca-ES', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

async function llegeixLot() {
  const res = await fetch(liveNewsEndpoint, { headers: { 'cache-control': 'no-cache' } })
  if (!res.ok) throw new Error(`El lot no es pot llegir (${res.status})`)
  return res.json()
}

// El refresc és ASÍNCRON: l'endpoint encua la feina i respon 202 amb l'adreça
// per consultar-la. Les dues esperes (la feina i la visibilitat del lot) viuen
// a lib/esperaRefresc.mjs, compartides amb renova-seccions.mjs i provades.
const ESPERA_MAXIMA_MS = 3 * 60 * 1000

async function refresh() {
  if (!refreshToken) {
    throw new Error('Falta BONDIARI_REFRESH_TOKEN a l’entorn.')
  }
  console.log(`→ Refrescant via ${endpoint} ...`)
  const startedAt = Date.now()

  const refreshRes = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${refreshToken}` },
  })
  if (!refreshRes.ok) {
    throw new Error(`Refresh ha retornat ${refreshRes.status}`)
  }
  const resposta = await refreshRes.json()

  let feina = null
  if (resposta.queued) {
    process.stdout.write('→ Encuat. Esperant que el radar acabi ')
    feina = await esperaFeina(resposta.statusUrl, refreshToken, {
      maxMs: ESPERA_MAXIMA_MS,
      onTick: () => process.stdout.write('.'),
    })
    process.stdout.write('\n')
  }
  // I encara: la feina pot constar acabada i el lot trigar a ser visible, perquè
  // KV és eventualment coherent. Esperem que la data del lot arribi a la que la
  // feina diu que ha escrit.
  const live = await esperaLotVisible(llegeixLot, feina?.result?.updatedAt, {
    onTick: () => process.stdout.write('·'),
  })

  const elapsedMs = Date.now() - startedAt
  console.log(`✓ Refresc completat en ${(elapsedMs / 1000).toFixed(1)} s`)
  console.log(`  Notícies al lot: ${(live.stories || []).length}`)
  console.log(`  Actualitzat: ${formatDate(live.updatedAt)}`)
  console.log(`  Pròxim refresc automàtic (cron): ${formatDate(live.nextRefreshAt)}`)
  if (feina?.result?.cache) {
    // Amb 'stale' o 'stale-incomplete' la feina ha anat bé però el radar no ha
    // pogut renovar res: la data d'abans es conserva a propòsit.
    console.log(`  Com ha acabat el radar: ${feina.result.cache}`)
    if (feina.result.cache === 'transient') {
      console.warn(
        '  ⚠ El lot públic NO s\'ha pogut desar (transient): el que es veu al web'
          + ' pot ser el d\'abans.',
      )
    }
  }

  const stories = live.stories || []

  const bySource = new Map()
  const byLanguage = new Map()
  for (const story of stories) {
    bySource.set(story.source, (bySource.get(story.source) || 0) + 1)
    byLanguage.set(story.language, (byLanguage.get(story.language) || 0) + 1)
  }

  console.log()
  console.log('Per font:')
  for (const [source, count] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source.padEnd(20)} ${count}`)
  }
  console.log()
  console.log('Per idioma:')
  for (const [lang, count] of [...byLanguage.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(lang || '?').padEnd(20)} ${count}`)
  }

  console.log()
  console.log('Primeres 10 notícies:')
  for (const story of stories.slice(0, 10)) {
    const date = (story.publishedAt || '').slice(0, 10)
    const source = (story.source || '?').padEnd(14)
    const title = (story.title || '').slice(0, 75)
    console.log(`  ${date} | ${source} | ${title}`)
  }
}

refresh().catch((error) => {
  console.error('✗ El refresc ha fallat:', error.message)
  process.exit(1)
})
