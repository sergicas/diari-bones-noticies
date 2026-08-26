import { getTerritorialComarca } from '../lib/territorial.js'
import {
  collectAgendaWidgetStories,
  collectIdescatUpdates,
  collectRaiscTerritorialGrants,
} from './rss/serviceFeeds.js'

export const TERRITORIAL_FRESH_TTL_SECONDS = 60 * 60
export const TERRITORIAL_DEGRADED_TTL_SECONDS = 15 * 60
export const TERRITORIAL_RETENTION_TTL_SECONDS = 24 * 60 * 60
export const TERRITORIAL_CACHE_PREFIX = 'territorial:v1:'

const sourceNames = ['agenda', 'raisc', 'idescat']

export const TERRITORIAL_SOURCE_CONFIG = Object.freeze({
  '13': Object.freeze({
    id: '13',
    slug: 'barcelones',
    name: 'Barcelonès',
    location: 'Barcelonès',
    agendaTag: 'agenda:ubicacions/barcelona/barcelones',
    idescatId: '13',
    idescatIndicators: ['f171', 'f261', 'f262'],
    raiscTerritorialCode: '13_08',
  }),
  '21': Object.freeze({
    id: '21',
    slug: 'maresme',
    name: 'Maresme',
    location: 'Maresme',
    agendaTag: 'agenda:ubicacions/barcelona/maresme',
    idescatId: '21',
    idescatIndicators: ['f171', 'f261', 'f262'],
    raiscTerritorialCode: '21_08',
  }),
})

const sourceMeta = Object.freeze({
  agenda: Object.freeze({
    label: 'Agenda Cultural',
    scope: 'comarca',
    quality:
      'Selecció territorial oficial. La data, l’horari i les condicions definitives es comproven a la fitxa enllaçada.',
  }),
  raisc: Object.freeze({
    label: 'Concessions culturals · RAISC',
    scope: 'comarca',
    quality:
      'Imports i nombre de concessions culturals ja atorgades, agregats per convocatòria i sense dades de les persones beneficiàries.',
  }),
  idescat: Object.freeze({
    label: 'Idescat',
    scope: 'comarca',
    quality: 'Indicadors oficials del codi comarcal seleccionat.',
  }),
})

function cacheKey(comarcaId) {
  return `${TERRITORIAL_CACHE_PREFIX}${comarcaId}`
}

function safeDate(value) {
  const timestamp = new Date(value || '').getTime()
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString()
}

function publicItem(story) {
  let url
  try {
    url = new URL(story?.url)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null

  const title = String(story?.title || '').trim()
  const summary = String(story?.summary || '').trim()
  if (!title || !summary) return null

  return {
    title: title.slice(0, 220),
    summary: summary.slice(0, 500),
    impact: String(story?.impact || '').trim().slice(0, 320),
    source: String(story?.source || '').trim(),
    url: url.toString(),
    location: String(story?.location || '').trim(),
    publishedAt: safeDate(story?.publishedAt),
    expiresAt: safeDate(story?.expiresAt),
  }
}

function normalizeSourceResult(
  name,
  result,
  previousSource = null,
  nowMs = Date.now(),
) {
  const meta = sourceMeta[name]
  const items = Array.isArray(result?.stories)
    ? result.stories.map(publicItem).filter(Boolean).slice(0, 6)
    : []
  const status = result?.status || (items.length ? 'ok' : 'empty')
  const previousRetainedUntilMs = new Date(
    previousSource?.retainedUntil || '',
  ).getTime()

  if (
    status === 'error' &&
    previousSource?.items?.length &&
    Number.isFinite(previousRetainedUntilMs) &&
    previousRetainedUntilMs > nowMs
  ) {
    return {
      ...meta,
      status: 'stale',
      items: previousSource.items,
      observedAt: previousSource.observedAt || null,
      retainedUntil: previousSource.retainedUntil,
    }
  }

  return {
    ...meta,
    status: status === 'error' ? 'error' : items.length ? 'ok' : 'empty',
    items,
    observedAt: new Date(nowMs).toISOString(),
    retainedUntil: new Date(
      nowMs + TERRITORIAL_RETENTION_TTL_SECONDS * 1000,
    ).toISOString(),
  }
}

function isCachedPayload(value, comarcaId, nowMs) {
  if (!value || value.version !== 1 || value.comarca?.id !== comarcaId) {
    return false
  }
  const retainedUntil = new Date(value.retainedUntil || '').getTime()
  return Number.isFinite(retainedUntil) && retainedUntil > nowMs
}

async function readCachedPayload(kv, comarcaId, nowMs) {
  if (!kv?.get) return null
  try {
    const value = await kv.get(cacheKey(comarcaId), 'json')
    return isCachedPayload(value, comarcaId, nowMs) ? value : null
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'territorial.cache.read-failed',
        comarcaId,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return null
  }
}

function withCacheStatus(payload, status) {
  return {
    ...payload,
    cache: {
      status,
      freshTtlSeconds: payload.freshTtlSeconds,
      retentionTtlSeconds: TERRITORIAL_RETENTION_TTL_SECONDS,
    },
  }
}

export class TerritorialUnavailableError extends Error {
  constructor(payload) {
    super('No territorial source is currently available')
    this.name = 'TerritorialUnavailableError'
    this.payload = payload
  }
}

export async function getTerritorialPayload(
  env,
  comarcaId,
  { fetchFn = fetch, nowMs = Date.now() } = {},
) {
  const comarca = getTerritorialComarca(comarcaId)
  const territory = TERRITORIAL_SOURCE_CONFIG[comarca?.id]
  if (!comarca || !territory) {
    throw new RangeError('unsupported-comarca')
  }

  const startedAt = Date.now()
  const cached = await readCachedPayload(env?.LIVE_NEWS_KV, comarca.id, nowMs)
  const cachedFreshUntilMs = new Date(cached?.freshUntil || '').getTime()
  if (
    cached &&
    Number.isFinite(cachedFreshUntilMs) &&
    cachedFreshUntilMs > nowMs
  ) {
    console.log(
      JSON.stringify({
        event: 'territorial.request.completed',
        comarcaId: comarca.id,
        cacheStatus: 'hit',
        durationMs: Date.now() - startedAt,
      }),
    )
    return withCacheStatus(cached, 'hit')
  }

  const [agendaResult, raiscResult, idescatResult] = await Promise.all([
    collectAgendaWidgetStories({ territory, fetchFn }),
    collectRaiscTerritorialGrants({
      territory,
      fetchFn,
      now: new Date(nowMs),
    }),
    collectIdescatUpdates({ territory, fetchFn }),
  ])

  const sources = {
    agenda: normalizeSourceResult(
      'agenda',
      agendaResult,
      cached?.sources?.agenda,
      nowMs,
    ),
    raisc: normalizeSourceResult(
      'raisc',
      raiscResult,
      cached?.sources?.raisc,
      nowMs,
    ),
    idescat: normalizeSourceResult(
      'idescat',
      idescatResult,
      cached?.sources?.idescat,
      nowMs,
    ),
  }
  const statuses = sourceNames.map((name) => sources[name].status)
  const unavailable = statuses.every((status) => status === 'error')
  const degraded = statuses.some(
    (status) => status === 'error' || status === 'stale',
  )
  const nominalFreshTtlSeconds = degraded
    ? TERRITORIAL_DEGRADED_TTL_SECONDS
    : TERRITORIAL_FRESH_TTL_SECONDS
  const staleDeadlines = sourceNames
    .filter((name) => sources[name].status === 'stale')
    .map((name) => new Date(sources[name].retainedUntil || '').getTime())
    .filter((deadline) => Number.isFinite(deadline) && deadline > nowMs)
  const freshUntilMs = Math.min(
    nowMs + nominalFreshTtlSeconds * 1000,
    ...staleDeadlines,
  )
  const freshTtlSeconds = Math.max(
    0,
    Math.floor((freshUntilMs - nowMs) / 1000),
  )
  const updatedAt = new Date(nowMs).toISOString()
  const payload = {
    version: 1,
    ok: !unavailable,
    status: unavailable ? 'unavailable' : degraded ? 'degraded' : 'ready',
    comarca,
    updatedAt,
    freshUntil: new Date(freshUntilMs).toISOString(),
    retainedUntil: new Date(
      nowMs + TERRITORIAL_RETENTION_TTL_SECONDS * 1000,
    ).toISOString(),
    freshTtlSeconds,
    sources,
  }

  console.log(
    JSON.stringify({
      event: 'territorial.request.completed',
      comarcaId: comarca.id,
      cacheStatus: cached ? 'refresh' : 'miss',
      durationMs: Date.now() - startedAt,
      sources: Object.fromEntries(
        sourceNames.map((name) => [name, sources[name].status]),
      ),
    }),
  )

  if (unavailable) {
    throw new TerritorialUnavailableError(withCacheStatus(payload, 'miss'))
  }

  if (env?.LIVE_NEWS_KV?.put) {
    try {
      await env.LIVE_NEWS_KV.put(cacheKey(comarca.id), JSON.stringify(payload), {
        expirationTtl: TERRITORIAL_RETENTION_TTL_SECONDS,
      })
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'territorial.cache.write-failed',
          comarcaId: comarca.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  return withCacheStatus(payload, cached ? 'refresh' : 'miss')
}

function responseJson(body, status, cacheStatus, method) {
  return new Response(method === 'HEAD' ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-bondiari-cache': cacheStatus || 'none',
    },
  })
}

export async function handleTerritorialRequest(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(
      JSON.stringify({ ok: false, error: 'method-not-allowed' }),
      {
        status: 405,
        headers: {
          allow: 'GET, HEAD',
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      },
    )
  }

  const comarcaId = new URL(request.url).searchParams.get('comarca') || ''
  if (!getTerritorialComarca(comarcaId)) {
    return responseJson(
      { ok: false, error: 'unsupported-comarca', allowed: ['13', '21'] },
      400,
      'none',
      request.method,
    )
  }

  try {
    const payload = await getTerritorialPayload(env, comarcaId)
    return responseJson(
      payload,
      200,
      payload.cache.status,
      request.method,
    )
  } catch (error) {
    if (error instanceof TerritorialUnavailableError) {
      return responseJson(error.payload, 503, 'miss', request.method)
    }
    console.error(
      JSON.stringify({
        event: 'territorial.request.failed',
        comarcaId,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return responseJson(
      { ok: false, error: 'territorial-unavailable' },
      503,
      'none',
      request.method,
    )
  }
}
