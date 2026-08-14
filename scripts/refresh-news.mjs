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
// respon 202 amb l'adreça per consultar-la.
//
// Abans se sondejava la DATA del lot, i això enganya de dues maneres: si hi ha
// una altra feina a la cua que acaba primer, la data canvia i sembla que ha
// acabat la teva; i si la teva acaba sense novetats (cap font nova), la data
// NO canvia i sembla que no ha acabat. Ara es pregunta per la feina encuada i
// per cap altra.
const ESPERA_MAXIMA_MS = 3 * 60 * 1000
const INTERVAL_MS = 3000

async function esperaFeina(statusUrl) {
  const limit = Date.now() + ESPERA_MAXIMA_MS
  while (Date.now() < limit) {
    await new Promise((r) => setTimeout(r, INTERVAL_MS))
    const res = await fetch(statusUrl, {
      headers: { authorization: `Bearer ${refreshToken}` },
    })
    if (!res.ok) throw new Error(`L'estat de la feina no es pot llegir (${res.status})`)
    const feina = await res.json()
    if (feina.status === 'completed') return feina
    if (feina.status === 'failed') {
      throw new Error(`la feina ha fallat: ${feina.error || 'sense detall'}`)
    }
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
    feina = await esperaFeina(resposta.statusUrl)
    process.stdout.write('\n')
    if (!feina) {
      throw new Error(
        `El radar no ha acabat en ${ESPERA_MAXIMA_MS / 1000} s. `
          + 'Mira els registres del Worker: la feina pot seguir a la cua.',
      )
    }
  }
  // Només ara té sentit llegir el lot.
  const live = await llegeixLot()

  const elapsedMs = Date.now() - startedAt
  console.log(`✓ Refresc completat en ${(elapsedMs / 1000).toFixed(1)} s`)
  console.log(`  Notícies al lot: ${(live.stories || []).length}`)
  console.log(`  Actualitzat: ${formatDate(live.updatedAt)}`)
  console.log(`  Pròxim refresc automàtic (cron): ${formatDate(live.nextRefreshAt)}`)
  if (feina?.result?.cache) {
    // Amb 'stale' o 'stale-incomplete' la feina ha anat bé però el radar no ha
    // pogut renovar res: la data d'abans es conserva a propòsit.
    console.log(`  Com ha acabat el radar: ${feina.result.cache}`)
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
