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
  const refresh = await refreshRes.json()
  const elapsedMs = Date.now() - startedAt

  console.log(`✓ Refresc completat en ${(elapsedMs / 1000).toFixed(1)} s`)
  console.log(`  Notícies al lot: ${refresh.count}`)
  console.log(`  Actualitzat: ${formatDate(refresh.updatedAt)}`)
  console.log(`  Pròxim refresc automàtic (cron): ${formatDate(refresh.nextRefreshAt)}`)

  // Mostrem un resum del lot
  const liveRes = await fetch(liveNewsEndpoint)
  if (!liveRes.ok) {
    console.warn(`No s'ha pogut llegir el lot per resumir (${liveRes.status}).`)
    return
  }
  const live = await liveRes.json()
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
