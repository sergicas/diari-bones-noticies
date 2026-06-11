import { getStore } from '@netlify/blobs'

const storeName = 'bon-diari-stats'
const dailyKey = 'daily'
const pathsKey = 'paths'
const referrersKey = 'referrers'
const devicesKey = 'devices'
const totalKey = 'total'

const maxDailyDays = 120
const maxTopEntries = 200

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function parseDevice(viewport) {
  const width = Number(viewport) || 0
  if (width === 0) return 'unknown'
  if (width < 600) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

function safePath(path) {
  if (typeof path !== 'string') return '/'
  const cleaned = path.split('#')[0].split('?')[0]
  if (!cleaned || cleaned.length > 200) return '/'
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`
}

function safeReferrer(referrer) {
  if (typeof referrer !== 'string' || !referrer) return 'directe'
  try {
    const host = new URL(referrer).hostname.toLowerCase()
    if (!host || host === 'bondiari.com' || host === 'www.bondiari.com') {
      return 'intern'
    }
    return host.replace(/^www\./, '').slice(0, 100)
  } catch {
    return 'directe'
  }
}

async function updateCounter(store, key, increment) {
  const current = (await store.get(key, { type: 'json' })) || {}
  current[increment] = (current[increment] || 0) + 1
  await store.setJSON(key, current)
  return current
}

async function trimMap(store, key, max) {
  const current = (await store.get(key, { type: 'json' })) || {}
  const entries = Object.entries(current)
  if (entries.length <= max) return
  const trimmed = entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
  await store.setJSON(key, Object.fromEntries(trimmed))
}

async function trimDaily(store) {
  const current = (await store.get(dailyKey, { type: 'json' })) || {}
  const entries = Object.entries(current).sort()
  if (entries.length <= maxDailyDays) return
  const trimmed = entries.slice(-maxDailyDays)
  await store.setJSON(dailyKey, Object.fromEntries(trimmed))
}

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const path = safePath(body.path)
  const referrer = safeReferrer(body.referrer)
  const device = parseDevice(body.viewport)
  const day = todayKey()

  try {
    const store = getStore({ name: storeName })

    const total = Number((await store.get(totalKey, { type: 'json' })) || 0) + 1
    await store.setJSON(totalKey, total)

    await updateCounter(store, dailyKey, day)
    await updateCounter(store, pathsKey, path)
    await updateCounter(store, referrersKey, referrer)
    await updateCounter(store, devicesKey, device)

    await trimDaily(store)
    await trimMap(store, pathsKey, maxTopEntries)
    await trimMap(store, referrersKey, maxTopEntries)

    return new Response(JSON.stringify({ ok: true, total }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    console.error('track-visit error', error)
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
}

export const config = {
  path: '/api/track-visit',
}
