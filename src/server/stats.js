// Handlers de visites i estadístiques sobre Workers KV.
// L'API pública és la mateixa que tenia Netlify: /api/stats (GET) i /api/track-visit (POST).

const dailyKey = 'daily'
const pathsKey = 'paths'
const referrersKey = 'referrers'
const devicesKey = 'devices'
const totalKey = 'total'

const maxDailyDays = 120
const maxTopEntries = 200

// Comptadors de lectures per dia (paths:YYYY-MM-DD). Es fusionen els últims
// 7 dies per calcular "Les peces amb més lectures aquesta setmana".
const weeklyWindowDays = 7
// TTL de seguretat: KV esborra sol les claus diàries velles.
const dailyPathsTtlSeconds = 60 * 60 * 24 * 10

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function dayKeyOffset(offset) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}

function dailyPathsKey(day) {
  return `paths:${day}`
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

async function getMap(kv, key) {
  return (await kv.get(key, 'json')) || {}
}

async function setMap(kv, key, value) {
  await kv.put(key, JSON.stringify(value))
}

async function incrementCounter(kv, key, bucket) {
  const current = await getMap(kv, key)
  current[bucket] = (current[bucket] || 0) + 1
  await setMap(kv, key, current)
  return current
}

async function incrementDailyPath(kv, day, path) {
  const key = dailyPathsKey(day)
  const current = await getMap(kv, key)
  current[path] = (current[path] || 0) + 1
  await kv.put(key, JSON.stringify(current), {
    expirationTtl: dailyPathsTtlSeconds,
  })
}

async function getWeeklyPaths(kv) {
  const keys = Array.from({ length: weeklyWindowDays }, (_, i) =>
    dailyPathsKey(dayKeyOffset(i)),
  )
  const maps = await Promise.all(keys.map((key) => kv.get(key, 'json')))
  const merged = {}
  for (const map of maps) {
    for (const [path, count] of Object.entries(map || {})) {
      merged[path] = (merged[path] || 0) + Number(count || 0)
    }
  }
  return merged
}

async function trimMap(kv, key, max) {
  const current = await getMap(kv, key)
  const entries = Object.entries(current)
  if (entries.length <= max) return
  const trimmed = entries.sort((a, b) => b[1] - a[1]).slice(0, max)
  await setMap(kv, key, Object.fromEntries(trimmed))
}

async function trimDaily(kv) {
  const current = await getMap(kv, dailyKey)
  const entries = Object.entries(current).sort()
  if (entries.length <= maxDailyDays) return
  const trimmed = entries.slice(-maxDailyDays)
  await setMap(kv, dailyKey, Object.fromEntries(trimmed))
}

function topN(map, n) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }))
}

function sortDaily(map) {
  return Object.entries(map || {})
    .sort()
    .map(([day, count]) => ({ day, count }))
}

export async function handleTrackVisit(request, env) {
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
  const kv = env.STATS_KV

  try {
    const totalRaw = await kv.get(totalKey, 'json')
    const total = Number(totalRaw || 0) + 1
    await kv.put(totalKey, JSON.stringify(total))

    await incrementCounter(kv, dailyKey, day)
    await incrementCounter(kv, pathsKey, path)
    await incrementDailyPath(kv, day, path)
    await incrementCounter(kv, referrersKey, referrer)
    await incrementCounter(kv, devicesKey, device)

    await trimDaily(kv)
    await trimMap(kv, pathsKey, maxTopEntries)
    await trimMap(kv, referrersKey, maxTopEntries)

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

export async function handleStats(request, env) {
  const kv = env.STATS_KV
  try {
    const [total, daily, paths, referrers, devices, weeklyPaths] =
      await Promise.all([
        kv.get(totalKey, 'json'),
        kv.get(dailyKey, 'json'),
        kv.get(pathsKey, 'json'),
        kv.get(referrersKey, 'json'),
        kv.get(devicesKey, 'json'),
        getWeeklyPaths(kv),
      ])

    const sortedDaily = sortDaily(daily)
    const derivedTotal = sortedDaily.reduce(
      (sum, row) => sum + Number(row.count || 0),
      0,
    )

    const payload = {
      total: derivedTotal || Number(total || 0),
      daily: sortedDaily.slice(-30),
      topPaths: topN(paths, 12),
      topPathsWeek: topN(weeklyPaths, 12),
      topReferrers: topN(referrers, 10),
      devices: devices || {},
      updatedAt: new Date().toISOString(),
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    })
  } catch (error) {
    console.error('stats error', error)
    return new Response(
      JSON.stringify({
        error: 'No s’han pogut llegir les estadístiques.',
        total: 0,
        daily: [],
        topPaths: [],
        topPathsWeek: [],
        topReferrers: [],
        devices: {},
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'x-robots-tag': 'noindex, nofollow',
        },
      },
    )
  }
}
