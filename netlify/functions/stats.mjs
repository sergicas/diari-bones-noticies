import { getStore } from '@netlify/blobs'

const storeName = 'bon-diari-stats'

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

export default async () => {
  try {
    const store = getStore({ name: storeName })
    const [total, daily, paths, referrers, devices] = await Promise.all([
      store.get('total', { type: 'json' }),
      store.get('daily', { type: 'json' }),
      store.get('paths', { type: 'json' }),
      store.get('referrers', { type: 'json' }),
      store.get('devices', { type: 'json' }),
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

export const config = {
  path: '/api/stats',
}
