// Auto-publicació de les bones notícies noves a Bluesky i Mastodon.
// S'executa des del cron del radar: quan arriben peces noves, en publica unes
// poques (max 2 per execució) a les xarxes que tinguin credencials configurades.
// L'enllaç sempre apunta a bondiari.com/noticia/:id (que ja serveix una targeta
// social bonica), no a la font original — l'objectiu és portar lectors al diari.
//
// Credencials (secrets del Worker, tots opcionals):
//   BLUESKY_HANDLE          ex: bondiari.bsky.social
//   BLUESKY_APP_PASSWORD    app password generat a bsky.app (no la contrasenya!)
//   MASTODON_BASE_URL       ex: https://mastodont.cat
//   MASTODON_ACCESS_TOKEN   token d'accés de l'app a Mastodon
//
// Si no hi ha cap credencial, la funció no fa res (com el butlletí sense API key).

import { feedStoryId } from '../lib/story-id.js'

const BLUESKY_SERVICE = 'https://bsky.social'
const socialPostedKey = 'social-posted-urls'
const maxPerRun = 2
const retentionMs = 30 * 24 * 60 * 60 * 1000

export function storyLink(story) {
  return `https://bondiari.com/noticia/${feedStoryId(story.url)}`
}

function truncate(text, max) {
  const clean = String(text || '').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1).trimEnd()}…`
}

// Text del post: títol (truncat) + crèdit de la font. L'enllaç s'afegeix a part
// (a l'embed de Bluesky, al cos del toot de Mastodon).
export function composePostText(story, maxLen) {
  const via = story.source ? ` (via ${story.source})` : ''
  return truncate(story.title, maxLen - via.length) + via
}

// --- Bluesky ---------------------------------------------------------------

async function blueskyLogin(env) {
  const res = await fetch(`${BLUESKY_SERVICE}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identifier: env.BLUESKY_HANDLE,
      password: env.BLUESKY_APP_PASSWORD,
    }),
  })
  if (!res.ok) throw new Error(`Bluesky login ${res.status}`)
  return res.json()
}

async function blueskyUploadThumb(session, imageUrl) {
  try {
    const img = await fetch(imageUrl)
    if (!img.ok) return null
    const bytes = await img.arrayBuffer()
    if (bytes.byteLength > 976 * 1024) return null // límit de blob de Bluesky
    const res = await fetch(`${BLUESKY_SERVICE}/xrpc/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessJwt}`,
        'content-type': img.headers.get('content-type') || 'image/jpeg',
      },
      body: bytes,
    })
    if (!res.ok) return null
    return (await res.json()).blob
  } catch {
    return null
  }
}

async function publishToBluesky(env, story) {
  const session = await blueskyLogin(env)
  const link = storyLink(story)
  const thumb = story.imageUrl ? await blueskyUploadThumb(session, story.imageUrl) : null
  const record = {
    $type: 'app.bsky.feed.post',
    text: composePostText(story, 240),
    createdAt: new Date().toISOString(),
    langs: ['ca'],
    embed: {
      $type: 'app.bsky.embed.external',
      external: {
        uri: link,
        title: truncate(story.title, 290),
        description: truncate(story.summary || 'Una bona notícia a El Bon Diari.', 290),
        ...(thumb ? { thumb } : {}),
      },
    },
  }
  const res = await fetch(`${BLUESKY_SERVICE}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.accessJwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  })
  return { ok: res.ok, status: res.status }
}

// --- Mastodon --------------------------------------------------------------

async function publishToMastodon(env, story) {
  const base = String(env.MASTODON_BASE_URL).replace(/\/$/, '')
  const status = `${composePostText(story, 440)}\n\n${storyLink(story)}`
  const res = await fetch(`${base}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.MASTODON_ACCESS_TOKEN}`,
      'content-type': 'application/json',
      'idempotency-key': feedStoryId(story.url),
    },
    body: JSON.stringify({ status, language: 'ca', visibility: 'public' }),
  })
  return { ok: res.ok, status: res.status }
}

// --- Orquestració ----------------------------------------------------------

export async function announceFreshStories(env, stories) {
  const hasBluesky = Boolean(env.BLUESKY_HANDLE && env.BLUESKY_APP_PASSWORD)
  const hasMastodon = Boolean(env.MASTODON_BASE_URL && env.MASTODON_ACCESS_TOKEN)
  if (!hasBluesky && !hasMastodon) return { skipped: 'no-credentials' }

  const valid = (stories || []).filter((s) => s && s.url)
  let state
  try {
    state = (await env.STATS_KV.get(socialPostedKey, 'json')) || { seeded: false, entries: [] }
  } catch {
    state = { seeded: false, entries: [] }
  }
  const postedSet = new Set(state.entries.map((e) => e.url))
  const now = Date.now()

  // Primera activació: marquem el lot actual com a "ja vist" SENSE publicar-lo,
  // perquè no inundem les xarxes amb tot l'històric. A partir d'ara, només les
  // peces noves es publicaran.
  if (!state.seeded) {
    const seeded = {
      seeded: true,
      entries: valid.map((s) => ({ url: s.url, at: now })),
    }
    await env.STATS_KV.put(socialPostedKey, JSON.stringify(seeded))
    return { seeded: seeded.entries.length }
  }

  const fresh = valid
    .filter((s) => !postedSet.has(s.url))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, maxPerRun)

  let bluesky = 0
  let mastodon = 0
  for (const story of fresh) {
    if (hasBluesky) {
      try {
        if ((await publishToBluesky(env, story)).ok) bluesky += 1
      } catch (error) {
        console.error('[social][bluesky]', error)
      }
    }
    if (hasMastodon) {
      try {
        if ((await publishToMastodon(env, story)).ok) mastodon += 1
      } catch (error) {
        console.error('[social][mastodon]', error)
      }
    }
    state.entries.push({ url: story.url, at: now })
  }

  const cutoff = now - retentionMs
  state.entries = state.entries.filter((e) => Number(e.at) > cutoff)
  await env.STATS_KV.put(socialPostedKey, JSON.stringify(state))

  return { published: fresh.length, bluesky, mastodon }
}
