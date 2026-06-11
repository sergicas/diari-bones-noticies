// Worker principal de bondiari.com.
// - Routeja /api/live-news, /api/refresh-news, /api/stats i /api/track-visit.
// - Tota la resta del trànsit el cobreix el binding ASSETS (SPA estàtica amb
//   not_found_handling="single-page-application" → serveix index.html per a
//   rutes client-side com /noticia/:id, /manifest, /hemeroteca, /sobre).
// - El handler scheduled() refresca el radar cada 4h via cron trigger.

import { getLiveNewsPayload } from './server/liveNews.js'
import { handleStats, handleTrackVisit } from './server/stats.js'
import {
  handleSubscribe,
  handleUnsubscribe,
  sendWeeklyDigest,
} from './server/newsletter.js'

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {}),
    },
  })
}

async function handleLiveNews(request, env) {
  try {
    const url = new URL(request.url)
    const force = url.searchParams.get('force') === '1'
    const payload = await getLiveNewsPayload(env.LIVE_NEWS_KV, { force })
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'cache-control':
          'public, max-age=300, stale-while-revalidate=43200',
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

async function handleRefreshNews(request, env) {
  try {
    const payload = await getLiveNewsPayload(env.LIVE_NEWS_KV, { force: true })
    return jsonResponse({
      ok: true,
      count: payload.stories.length,
      nextRefreshAt: payload.nextRefreshAt,
      updatedAt: payload.updatedAt,
    })
  } catch (error) {
    console.error('No s’ha pogut executar l’actualització programada', error)
    return jsonResponse({ ok: false }, { status: 500 })
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === '/api/live-news') return handleLiveNews(request, env)
    if (path === '/api/refresh-news') return handleRefreshNews(request, env)
    if (path === '/api/stats') return handleStats(request, env)
    if (path === '/api/track-visit') return handleTrackVisit(request, env)
    if (path === '/api/newsletter/subscribe') return handleSubscribe(request, env)
    if (path === '/api/newsletter/unsubscribe') return handleUnsubscribe(request, env)

    // Per a qualsevol ruta no-API, delega al sistema d'assets estàtics.
    return env.ASSETS.fetch(request)
  },

  async scheduled(event, env, ctx) {
    // El cron del butlletí (diumenges 07:00 UTC) envia el digest setmanal.
    // La resta de crons refresquen el radar de notícies.
    if (event.cron === '0 7 * * SUN') {
      ctx.waitUntil(
        sendWeeklyDigest(env)
          .then((r) => console.log(`[cron][newsletter] sent=${r.sent} failed=${r.failed} logged=${r.logged}`))
          .catch((err) => console.error('[cron][newsletter] error', err)),
      )
      return
    }
    ctx.waitUntil(
      getLiveNewsPayload(env.LIVE_NEWS_KV, { force: true })
        .then((p) => console.log(`[cron] radar refrescat: ${p.stories.length} notícies`))
        .catch((err) => console.error('[cron] error refrescant radar', err)),
    )
  },
}
