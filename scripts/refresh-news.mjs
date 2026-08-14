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

// El refresc és ASÍNCRON des del 14-08-2026: l'endpoint encua la feina i
// respon 202. Abans aquest script anunciava que havia acabat i tot seguit
// llegia el lot VELL, ensenyant xifres d'abans com si fossin noves.
const ESPERA_MAXIMA_MS = 3 * 60 * 1000
const INTERVAL_MS = 3000

async function esperaLotNou(updatedAtAbans) {
  const limit = Date.now() + ESPERA_MAXIMA_MS
  while (Date.now() < limit) {
    await new Promise((r) => setTimeout(r, INTERVAL_MS))
    const lot = await llegeixLot()
    if (lot.updatedAt && lot.updatedAt !== updatedAtAbans) return lot
    process.stdout.write('.')
  }
  return null
}

async function refresh() {
  if (!refreshToken) {
    throw new Error('Falta BONDIARI_REFRESH_TOKEN a l’entorn.')
  }
  console.log(`→ Refrescant via ${endpoint} ...`)
  const startedAt = Date.now()

  // La data d'ara, per saber quan el lot ha canviat de debò.
  const lotAbans = await llegeixLot().catch(() => ({}))
  const updatedAtAbans = lotAbans.updatedAt || null

  const refreshRes = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${refreshToken}` },
  })
  if (!refreshRes.ok) {
    throw new Error(`Refresh ha retornat ${refreshRes.status}`)
  }
  const resposta = await refreshRes.json()

  let live
  if (resposta.queued) {
    console.log('→ Encuat. Esperant que el radar acabi', '')
    live = await esperaLotNou(updatedAtAbans)
    process.stdout.write('\n')
    if (!live) {
      throw new Error(
        `El radar no ha acabat en ${ESPERA_MAXIMA_MS / 1000} s. `
          + 'Mira els registres del Worker: la feina pot seguir a la cua.',
      )
    }
  } else {
    // Sense cua configurada, l'endpoint ho fa al moment.
    live = await llegeixLot()
  }

  const elapsedMs = Date.now() - startedAt
  console.log(`✓ Refresc completat en ${(elapsedMs / 1000).toFixed(1)} s`)
  console.log(`  Notícies al lot: ${(live.stories || []).length}`)
  console.log(`  Actualitzat: ${formatDate(live.updatedAt)}`)
  console.log(`  Pròxim refresc automàtic (cron): ${formatDate(live.nextRefreshAt)}`)

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
