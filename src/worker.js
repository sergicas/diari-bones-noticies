// Worker principal de bondiari.com.
// - Routeja /api/live-news, /api/refresh-news, /api/stats i /api/track-visit.
// - Tota la resta del trànsit el cobreix el binding ASSETS (SPA estàtica amb
//   not_found_handling="single-page-application" → serveix index.html per a
//   rutes client-side com /noticia/:id, /manifest, /hemeroteca, /sobre).
// - El handler scheduled() refresca el radar cada 4h via cron trigger.

import { getLiveNewsPayload, readEditorialStats } from './server/liveNews.js'
import { handleStats, handleTrackVisit } from './server/stats.js'
import {
  handleSubscribe,
  handleUnsubscribe,
  handleConfirm,
  handleNewsletterStats,
  sendDailyDigest,
} from './server/newsletter.js'
import { renderStoryPage } from './server/storyMeta.js'
import { announceFreshStories } from './server/social.js'

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {}),
    },
  })
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
  try {
    const url = new URL(request.url)
    const force = url.searchParams.get('force') === '1'
    const payload = await getLiveNewsPayload(env.LIVE_NEWS_KV, { force, env })
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
    const payload = await getLiveNewsPayload(env.LIVE_NEWS_KV, { force: true, env })
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

async function route(request, env) {
  const url = new URL(request.url)
  const path = url.pathname

  if (path === '/api/live-news') return handleLiveNews(request, env)
  if (path === '/api/refresh-news') return handleRefreshNews(request, env)
  if (path === '/api/stats') return handleStats(request, env)
  if (path === '/api/editorial-stats') {
    const stats = await readEditorialStats(env.LIVE_NEWS_KV)
    return new Response(JSON.stringify(stats), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=600, stale-while-revalidate=3600',
      },
    })
  }
  if (path === '/api/track-visit') return handleTrackVisit(request, env)
  if (path === '/api/newsletter/subscribe') return handleSubscribe(request, env)
  if (path === '/api/newsletter/confirm') return handleConfirm(request, env)
  if (path === '/api/newsletter/unsubscribe') return handleUnsubscribe(request, env)
  if (path === '/api/newsletter/stats') return handleNewsletterStats(request, env)

  // Pàgina de notícia: servim l'HTML amb meta socials propis (títol, imatge)
  // perquè quan algú la comparteix surti la targeta de la peça, no la genèrica.
  if (path.startsWith('/noticia/')) {
    const storyPage = await renderStoryPage(request, env)
    if (storyPage) return storyPage
  }

  // Per a qualsevol ruta no-API, delega al sistema d'assets estàtics.
  return env.ASSETS.fetch(request)
}

export default {
  async fetch(request, env) {
    const response = await route(request, env)
    return withSecurityHeaders(response)
  },

  async scheduled(event, env, ctx) {
    // El cron del butlletí (cada dia 05:00 UTC = 07:00 a Madrid) refresca el
    // radar i envia el digest diari amb les bones notícies del dia.
    // La resta de crons només refresquen el radar de notícies.
    if (event.cron === '0 5 * * *') {
      ctx.waitUntil(
        getLiveNewsPayload(env.LIVE_NEWS_KV, { force: true, env })
          .then(() => sendDailyDigest(env))
          .then((r) => console.log(`[cron][newsletter] sent=${r.sent} failed=${r.failed} logged=${r.logged}`))
          .catch((err) => console.error('[cron][newsletter] error', err)),
      )
      return
    }
    ctx.waitUntil(
      getLiveNewsPayload(env.LIVE_NEWS_KV, { force: true, env })
        .then(async (p) => {
          console.log(`[cron] radar refrescat: ${p.stories.length} notícies`)
          // Publiquem les peces noves a Bluesky/Mastodon (si hi ha credencials).
          const social = await announceFreshStories(env, p.stories)
          console.log('[cron][social]', JSON.stringify(social))
        })
        .catch((err) => console.error('[cron] error refrescant radar', err)),
    )
  },
}
