#!/usr/bin/env node

const refreshEndpoint =
  process.env.BONDIARI_REFRESH_URL ||
  'https://bondiari.sergicas.workers.dev/api/refresh-news'
const endpoint =
  process.env.BONDIARI_ARCHIVE_BACKFILL_URL ||
  refreshEndpoint.replace('/api/refresh-news', '/api/archive-backfill')
const token = process.env.BONDIARI_REFRESH_TOKEN

async function backfill() {
  if (!token) {
    throw new Error('Falta BONDIARI_REFRESH_TOKEN a l’entorn.')
  }

  console.log('→ Recuperant les còpies temporals cap a l’hemeroteca permanent…')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || `La recuperació ha retornat ${response.status}`)
  }

  console.log('✓ Recuperació completada')
  console.log(`  Còpies trobades: ${payload.scanned}`)
  console.log(`  Peces conservades: ${payload.accepted}`)
  console.log(`  Recents per a portada: ${payload.recent}`)
  console.log(`  Antigues per a hemeroteca: ${payload.archived}`)
  console.log(`  Fora dels temes: ${payload.outsideTopic}`)
  console.log(`  Rebutjades per qualitat: ${payload.qualityRejected}`)
}

backfill().catch((error) => {
  console.error('✗ La recuperació ha fallat:', error.message)
  process.exit(1)
})
