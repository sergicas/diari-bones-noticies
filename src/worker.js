// Worker principal de bondiari.com.
// - Routeja /api/live-news, /api/refresh-news, /api/stats i /api/track-visit.
// - Tota la resta del trànsit el cobreix el binding ASSETS (SPA estàtica amb
//   not_found_handling="single-page-application" → serveix index.html per a
//   rutes client-side com /noticia/:id, /manifest, /hemeroteca, /sobre).
// - El handler scheduled() refresca el radar dues vegades al dia via cron.

import { getLiveNewsPayload, readEditorialStats, readFeedHealthStats, getLiveTicker, isFeedPaused } from './server/liveNews.js'
import { rssFeeds } from './server/rss/feedsConfig.js'
import { handleStats, handleTrackVisit } from './server/stats.js'
import {
  handleSubscribe,
  handleUnsubscribe,
  handleConfirm,
  handleNewsletterStats,
  readNewsletterAudience,
} from './server/newsletter.js'
import { renderStoryPage, findStory } from './server/storyMeta.js'
import { renderContentPage } from './server/pageContent.js'
import { handleReviewRoutes } from './server/reviewPage.js'
import { handleNewsSitemap } from './server/newsSitemap.js'
import { handleArchiveSitemap } from './server/archiveSitemap.js'
import { handlePushSubscribe, handlePushUnsubscribe } from './server/push.js'
import { handleApnsRegister } from './server/apns.js'
import { handleStoryImage } from './server/storyImage.js'
import {
  backfillEditorialArchive,
  persistEditorialEdition,
  readEditorialStoryCatalog,
  readPipelineJob,
  readPipelineHealth,
  readUniqueEditorialStats,
} from './server/editorialStore.js'
import {
  buildManualRefreshQueueMessage,
  buildRefreshQueueMessage,
  handlePipelineBatch,
} from './server/pipelineQueue.js'
import { buildOperationalHealth } from './server/operationsHealth.js'

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {}),
    },
  })
}

function methodNotAllowed(allowed = 'GET') {
  return jsonResponse(
    { ok: false, error: 'method-not-allowed' },
    { status: 405, headers: { allow: allowed, 'cache-control': 'no-store' } },
  )
}

async function secretsMatch(provided, expected) {
  if (!provided || !expected) return false
  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(providedHash, expectedHash)
  }
  // Node i alguns entorns de test encara no exposen timingSafeEqual a SubtleCrypto.
  // Els Workers sí; aquest recorregut manté els tests i el desenvolupament local.
  const left = new Uint8Array(providedHash)
  const right = new Uint8Array(expectedHash)
  let difference = left.length ^ right.length
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}

export async function isRefreshAuthorized(request, env) {
  const authorization = request.headers.get('authorization') || ''
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''
  return secretsMatch(provided, env.BONDIARI_REFRESH_TOKEN)
}

export async function isFeedHealthAuthorized(request, env) {
  // Només capçaleres: un token dins l'URL (?token=...) acabaria escrit en
  // registres i historials, així que no s'accepta.
  const authorization = request.headers.get('authorization') || ''
  const customHeader = request.headers.get('x-health-token') || ''
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : customHeader
  const expectedToken = env.BONDIARI_FEED_HEALTH_TOKEN || env.BONDIARI_REFRESH_TOKEN
  return secretsMatch(provided, expectedToken)
}

// Capçaleres de seguretat aplicades a totes les respostes.
// CSP prudent: script propi només ('self'), imatges de qualsevol https
// (les fotos venen de molts mitjans: 3cat, ara, beteve, ...), estils inline
// permesos (React n'injecta algun), i res d'iframes de tercers.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ')

const SECURITY_HEADERS = {
  'content-security-policy': CONTENT_SECURITY_POLICY,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'permissions-policy': 'geolocation=(), microphone=(), camera=(), browsing-topics=()',
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function handleLiveNews(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed('GET, HEAD')
  }
  try {
    const payload = await getLiveNewsPayload(env.LIVE_NEWS_KV, {
      env,
      allowRefresh: false,
    })
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        // El radar és "en viu": no el cachegem al CDN ni al navegador. Abans hi
        // havia `max-age=300, stale-while-revalidate=43200`, que permetia servir
        // una edició VELLA fins a 12 h i feia que les notícies (i els arranjaments)
        // no es renovessin per als visitants. La lectura de KV és barata.
        'cache-control': 'no-store, no-cache, must-revalidate',
        'content-type': 'application/json; charset=utf-8',
      },
    })
  } catch (error) {
    console.error('No s’ha pogut carregar el radar en viu', error)
    return jsonResponse(
      {
        error: 'No s’ha pogut carregar el radar en viu.',
        stories: [],
      },
      { status: 500 },
    )
  }
}

/**
 * Estat d'una feina de la cua, per clau d'idempotència.
 *
 * Protegida amb el mateix testimoni que el refresc: diu com va la maquinària
 * per dins i no ha de ser pública. La clau va a l'URL perquè NO és cap secret
 * —el secret és el testimoni de la capçalera— i així l'adreça es pot desar i
 * tornar a consultar.
 */
async function handlePipelineJob(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed('GET, HEAD')
  }
  if (!(await isRefreshAuthorized(request, env))) {
    return jsonResponse(
      { ok: false, error: 'unauthorized' },
      {
        status: 401,
        headers: {
          'cache-control': 'no-store',
          'www-authenticate': 'Bearer realm="bondiari-refresh"',
        },
      },
    )
  }
  const key = new URL(request.url).searchParams.get('key') || ''
  if (!key) {
    return jsonResponse(
      { ok: false, error: 'missing-key' },
      { status: 400, headers: { 'cache-control': 'no-store' } },
    )
  }
  try {
    const job = await readPipelineJob(env, key)
    if (!job) {
      // Encara no ha començat: la cua pot trigar a repartir el missatge.
      return jsonResponse(
        { ok: true, status: 'queued', idempotencyKey: key },
        { status: 200, headers: { 'cache-control': 'no-store' } },
      )
    }
    return jsonResponse(
      { ok: true, ...job },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    console.error('No s’ha pogut llegir l’estat de la feina', error)
    return jsonResponse({ ok: false }, { status: 500 })
  }
}

async function handleRefreshNews(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!(await isRefreshAuthorized(request, env))) {
    return jsonResponse(
      { ok: false, error: 'unauthorized' },
      {
        status: 401,
        headers: {
          'cache-control': 'no-store',
          'www-authenticate': 'Bearer realm="bondiari-refresh"',
        },
      },
    )
  }
  try {
    // PASSA PER LA CUA, NO EXECUTA DIRECTAMENT (14-08-2026).
    //
    // Executant-lo aquí, un refresc manual podia coincidir amb el del cron i
    // totes dues execucions es trepitjaven el lot públic. Amb la cua
    // serialitzada (max_concurrency: 1 a wrangler.jsonc) hi ha un sol
    // escriptor de debò, que és el que aquesta arquitectura dona per suposat.
    if (env.INGEST_QUEUE) {
      const message = buildManualRefreshQueueMessage()
      await env.INGEST_QUEUE.send(message, { contentType: 'json' })
      // 202: acceptat, encara no fet. Retornar 200 faria creure a qui truca
      // que el refresc ja ha acabat, i llegiria el lot vell pensant que és nou.
      //
      // S'hi torna l'adreça per consultar AQUESTA feina. Sondejar la data del
      // lot no serveix: una feina aliena que acabi abans la canviaria, i una de
      // pròpia que acabi sense novetats no la canviaria.
      const statusUrl = `${new URL(request.url).origin}/api/pipeline-job?key=${encodeURIComponent(
        message.idempotencyKey,
      )}`
      return jsonResponse(
        {
          ok: true,
          queued: true,
          idempotencyKey: message.idempotencyKey,
          statusUrl,
        },
        {
          status: 202,
          headers: { 'cache-control': 'no-store', location: statusUrl },
        },
      )
    }
    // Sense cua configurada (desenvolupament local), es fa aquí mateix.
    const payload = await getLiveNewsPayload(env.LIVE_NEWS_KV, { force: true, env })
    const edition = await persistEditorialEdition(env, payload, {
      slot: 'manual',
      trigger: 'manual',
    })
    return jsonResponse({
      ok: true,
      queued: false,
      count: payload.stories.length,
      editionId: edition.editionId,
      nextRefreshAt: payload.nextRefreshAt,
      updatedAt: payload.updatedAt,
    })
  } catch (error) {
    console.error('No s’ha pogut executar l’actualització programada', error)
    return jsonResponse({ ok: false }, { status: 500 })
  }
}

async function handleArchive(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed('GET, HEAD')
  }
  try {
    const catalog = await readEditorialStoryCatalog(env)
    return jsonResponse(catalog, {
      headers: {
        'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    })
  } catch (error) {
    console.error('No s’ha pogut carregar l’hemeroteca permanent', error)
    return jsonResponse(
      { available: false, stories: [], count: 0, error: 'archive-unavailable' },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    )
  }
}

async function handleArchiveBackfill(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!(await isRefreshAuthorized(request, env))) {
    return jsonResponse(
      { ok: false, error: 'unauthorized' },
      {
        status: 401,
        headers: {
          'cache-control': 'no-store',
          'www-authenticate': 'Bearer realm="bondiari-archive"',
        },
      },
    )
  }
  try {
    const result = await backfillEditorialArchive(env)
    return jsonResponse(
      { ok: result.available, ...result },
      {
        status: result.available ? 200 : 503,
        headers: { 'cache-control': 'no-store' },
      },
    )
  } catch (error) {
    console.error('No s’ha pogut recuperar l’hemeroteca temporal', error)
    return jsonResponse(
      { ok: false, error: 'archive-backfill-failed' },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    )
  }
}

async function handleEditorialStats(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed('GET, HEAD')
  }
  const [rawStats, uniqueStats] = await Promise.all([
    readEditorialStats(env.LIVE_NEWS_KV),
    readUniqueEditorialStats(env),
  ])
  return jsonResponse(
    {
      ...rawStats,
      processedEntries: Number(rawStats?.reviewed || 0),
      publishedUnique: uniqueStats.available
        ? uniqueStats.publishedUnique
        : Number(rawStats?.published || 0),
      trackingSince: uniqueStats.trackingSince,
    },
    {
      headers: {
        'cache-control': 'public, max-age=600, stale-while-revalidate=3600',
      },
    },
  )
}

async function handleFeedHealth(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed('GET, HEAD')
  }
  if (!(await isFeedHealthAuthorized(request, env))) {
    return jsonResponse(
      { ok: false, error: 'unauthorized' },
      {
        status: 401,
        headers: {
          'cache-control': 'no-store',
          'www-authenticate': 'Bearer realm="bondiari-health"',
        },
      },
    )
  }
  try {
    const kv = env.LIVE_NEWS_KV
    const stats = await readFeedHealthStats(env)
    if (stats?._readError) {
      return jsonResponse(
        { ok: false, error: 'kv-read-error' },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      )
    }

    const url = new URL(request.url)
    const isDashboard = url.searchParams.get('mode') === 'dashboard'

    if (isDashboard && kv) {
      const today = new Date()
      const historyKeys = Array.from({ length: 30 }, (_, index) => {
        const date = new Date(today.getTime() - index * 24 * 60 * 60 * 1000)
        return `health-daily:${date.toISOString().slice(0, 10)}`
      })
      const safeKvJson = async (key) => {
        try {
          return await kv.get(key, 'json')
        } catch {
          return null
        }
      }
      const safeQueueMetrics = async (queue) => {
        if (!queue?.metrics) return { available: false }
        try {
          return { available: true, ...(await queue.metrics()) }
        } catch {
          return { available: false }
        }
      }
      const safePipelineHealth = async () => {
        try {
          return await readPipelineHealth(env)
        } catch (error) {
          console.error(
            JSON.stringify({
              event: 'pipeline.dashboard.database-failed',
              error: error instanceof Error ? error.message : String(error),
            }),
          )
          return { available: false }
        }
      }
      const safeNewsletterAudience = async () => {
        try {
          return await readNewsletterAudience(env)
        } catch (error) {
          console.error(
            JSON.stringify({
              event: 'newsletter.dashboard.read-failed',
              error: error instanceof Error ? error.message : String(error),
            }),
          )
          return {
            available: false,
            confirmed: 0,
            pending: 0,
            expiredPending: 0,
            total: 0,
            subscribers: [],
          }
        }
      }
      const [
        cronTiming,
        pipelineDatabase,
        ingestQueue,
        distributionQueue,
        audience,
        ...historyResults
      ] = await Promise.all([
        safeKvJson('cron-timing:latest'),
        safePipelineHealth(),
        safeQueueMetrics(env.INGEST_QUEUE),
        safeQueueMetrics(env.DISTRIBUTION_QUEUE),
        safeNewsletterAudience(),
        ...historyKeys.map(safeKvJson),
      ])
      const history = historyResults.filter(Boolean)

      const circuitBreakers = Object.values(stats || {}).filter(
        (rec) => rec && typeof rec === 'object' && isFeedPaused(rec),
      )

      // El catàleg viatja dins la resposta: la vista /diagnostic no pot
      // importar src/server/ (vite l'exclou del bundle del client).
      const catalog = rssFeeds.map((feed) => ({
        name: feed.name,
        language: feed.language,
        defaultCategory: feed.defaultCategory,
        core: Boolean(feed.core),
      }))
      const pipeline = {
        database: pipelineDatabase,
        queues: {
          ingest: ingestQueue,
          distribution: distributionQueue,
        },
      }
      const operations = buildOperationalHealth({
        cronTiming,
        circuitBreakers,
        pipeline,
      })

      return jsonResponse(
        {
          ok: true,
          stats,
          cronTiming,
          circuitBreakers,
          history,
          catalog,
          pipeline,
          audience,
          operations,
        },
        { headers: { 'cache-control': 'no-store' } },
      )
    }

    return jsonResponse({ ok: true, stats }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('No s’han pogut carregar les mètriques de salut dels feeds', error)
    return jsonResponse({ ok: false, error: 'internal-error' }, { status: 500 })
  }
}

async function handlePipelineHealth(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed('GET, HEAD')
  }
  if (!(await isFeedHealthAuthorized(request, env))) {
    return jsonResponse(
      { ok: false, error: 'unauthorized' },
      {
        status: 401,
        headers: {
          'cache-control': 'no-store',
          'www-authenticate': 'Bearer realm="bondiari-pipeline"',
        },
      },
    )
  }
  try {
    const [database, ingestQueue, distributionQueue] = await Promise.all([
      readPipelineHealth(env),
      env.INGEST_QUEUE?.metrics?.() ?? null,
      env.DISTRIBUTION_QUEUE?.metrics?.() ?? null,
    ])
    return jsonResponse(
      {
        ok: true,
        environment: env.ENVIRONMENT || 'production',
        database,
        queues: {
          ingest: ingestQueue,
          distribution: distributionQueue,
        },
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'pipeline.health.failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return jsonResponse(
      { ok: false, error: 'pipeline-health-failed' },
      { status: 500 },
    )
  }
}

async function handlePipelineTrigger(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!(await isRefreshAuthorized(request, env))) {
    return jsonResponse(
      { ok: false, error: 'unauthorized' },
      {
        status: 401,
        headers: {
          'cache-control': 'no-store',
          'www-authenticate': 'Bearer realm="bondiari-pipeline"',
        },
      },
    )
  }
  if (!env.INGEST_QUEUE) {
    return jsonResponse(
      { ok: false, error: 'queue-unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }

  let payload = {}
  try {
    payload = await request.json()
  } catch {
    // El cos és opcional: per defecte només s’ingereix i es persisteix.
  }
  const distribution = payload?.distribution || 'none'
  if (!['none', 'daily', 'social'].includes(distribution)) {
    return jsonResponse(
      { ok: false, error: 'invalid-distribution' },
      { status: 422, headers: { 'cache-control': 'no-store' } },
    )
  }
  const requestedKey = request.headers.get('idempotency-key')?.trim()
  const idempotencyKey =
    requestedKey && requestedKey.length <= 160 ? requestedKey : undefined
  const message = buildManualRefreshQueueMessage({
    distribution,
    idempotencyKey,
  })
  await env.INGEST_QUEUE.send(message, { contentType: 'json' })
  return jsonResponse(
    {
      ok: true,
      queued: true,
      idempotencyKey: message.idempotencyKey,
      distribution,
    },
    { status: 202, headers: { 'cache-control': 'no-store' } },
  )
}

async function route(request, env, ctx) {
  const url = new URL(request.url)
  const path = url.pathname

  if (path === '/api/feed-health') return handleFeedHealth(request, env)
  if (path === '/api/pipeline-health') return handlePipelineHealth(request, env)
  if (path === '/api/pipeline-trigger') return handlePipelineTrigger(request, env)

  // Il·lustració editorial pròpia de cada peça (generada per IA i cachejada).
  // Substitueix les fotos de premsa de tercers: cap risc de drets d'autor.
  if (path.startsWith('/api/story-image/')) return handleStoryImage(request, env, ctx)

  if (path === '/api/live-news') return handleLiveNews(request, env)
  if (path === '/api/archive') return handleArchive(request, env)
  if (path === '/api/archive-backfill') {
    return handleArchiveBackfill(request, env)
  }
  // Secció "En directe": titulars lleugers que enllacen a la font, refrescats
  // contínuament (cache curta al servidor, no-store al client).
  if (path === '/api/live-ticker') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return methodNotAllowed('GET, HEAD')
    }
    try {
      const ticker = await getLiveTicker(env)
      return new Response(JSON.stringify(ticker), {
        status: 200,
        headers: {
          'cache-control': 'no-store, no-cache, must-revalidate',
          'content-type': 'application/json; charset=utf-8',
        },
      })
    } catch (error) {
      console.error('No s’ha pogut carregar el directe', error)
      return jsonResponse({ error: 'directe indisponible', items: [] }, { status: 500 })
    }
  }
  if (path === '/api/refresh-news') return handleRefreshNews(request, env)
  if (path === '/api/pipeline-job') return handlePipelineJob(request, env)
  if (path === '/api/stats') return handleStats(request, env)
  if (path === '/api/editorial-stats') return handleEditorialStats(request, env)
  // Una peça concreta per id. La fa servir el front quan es demana /noticia/:id
  // d'una peça que ja no és a la portada (rotada fora de la finestra), perquè es
  // pugui renderitzar en lloc de mostrar un 404.
  if (path.startsWith('/api/story/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return methodNotAllowed('GET, HEAD')
    }
    let id = ''
    try {
      id = decodeURIComponent(path.slice('/api/story/'.length)).trim()
    } catch {
      return jsonResponse({ error: 'invalid-story-id' }, { status: 400 })
    }
    const story = id ? await findStory(id, env) : null
    if (!story) {
      return new Response(JSON.stringify({ error: 'not-found' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    }
    return new Response(JSON.stringify({ story }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    })
  }

  if (path === '/api/track-visit') return handleTrackVisit(request, env)
  if (path === '/api/newsletter/subscribe') return handleSubscribe(request, env)
  if (path === '/api/newsletter/confirm') return handleConfirm(request, env)
  if (path === '/api/newsletter/unsubscribe') return handleUnsubscribe(request, env)
  if (path === '/api/newsletter/stats') return handleNewsletterStats(request, env)

  // Sitemap de Google News amb les peces vives del radar (últimes 48 h).
  if (path === '/news-sitemap.xml') return handleNewsSitemap(env)

  // Sitemap durador amb TOTES les peces de l'hemeroteca (D1).
  if (path === '/sitemap-hemeroteca.xml') return handleArchiveSitemap(env)

  // Notificacions push (PWA).
  if (path === '/api/push/subscribe') return handlePushSubscribe(request, env)
  if (path === '/api/push/unsubscribe') return handlePushUnsubscribe(request, env)
  if (path === '/api/push/register-apns') return handleApnsRegister(request, env)

  // Sala de revisió privada: cap peça nova no es publica fins que una persona
  // l'ha llegida aquí. Va abans que qualsevol altra pàgina perquè /revisio no
  // caigui mai al fallback de la SPA.
  const reviewPage = await handleReviewRoutes(request, env)
  if (reviewPage) return reviewPage

  // Pàgina de notícia: servim l'HTML amb meta socials propis (títol, imatge)
  // perquè quan algú la comparteix surti la targeta de la peça, no la genèrica.
  if (path.startsWith('/noticia/')) {
    const storyPage = await renderStoryPage(request, env)
    if (storyPage) return storyPage
  }

  // Portada, temes, hemeroteca, índex de temes i pàgines fixes: injectem text
  // real dins del HTML perquè Googlebot i els lectors sense JS hi vegin
  // contingut (fins ara arribaven amb el <body> buit). Si la ruta no li pertoca
  // o falla, renderContentPage retorna null i caiem al fallback d'ASSETS.
  const contentPage = await renderContentPage(request, env)
  if (contentPage) return contentPage

  // Per a qualsevol ruta no-API, delega al sistema d'assets estàtics.
  return env.ASSETS.fetch(request)
}

export default {
  async fetch(request, env, ctx) {
    try {
      const response = await route(request, env, ctx)
      return withSecurityHeaders(response)
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'unhandled request error',
          error: error instanceof Error ? error.message : String(error),
          method: request.method,
          path: new URL(request.url).pathname,
        }),
      )
      return withSecurityHeaders(
        jsonResponse({ error: 'internal-server-error' }, { status: 500 }),
      )
    }
  },

  async scheduled(event, env, ctx) {
    const message = buildRefreshQueueMessage(event)
    if (env.INGEST_QUEUE) {
      ctx.waitUntil(
        env.INGEST_QUEUE.send(message, { contentType: 'json' }).then(() => {
          console.log(
            JSON.stringify({
              event: 'cron.refresh.queued',
              cron: event.cron,
              idempotencyKey: message.idempotencyKey,
            }),
          )
        }),
      )
    } else {
      ctx.waitUntil(
        getLiveNewsPayload(env.LIVE_NEWS_KV, { force: true, env })
          .then((payload) =>
            persistEditorialEdition(env, payload, {
              slot: message.slot,
              trigger: 'cron-fallback',
            }),
          )
          .catch((error) => {
            console.error(
              JSON.stringify({
                event: 'cron.refresh.fallback-failed',
                error: error instanceof Error ? error.message : String(error),
              }),
            )
          }),
      )
    }
  },

  async queue(batch, env) {
    await handlePipelineBatch(batch, env)
  },
}
