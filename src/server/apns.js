// Notificacions push NATIVES d'iOS via APNs (Apple Push Notification service).
// És un canal diferent del Web Push (push.js): iOS fa servir un device token i
// l'API HTTP/2 d'APNs, amb un JWT signat amb una clau .p8 (ES256).
//
// Config necessària (secrets/vars del Worker):
//   - APNS_PRIVATE_KEY : contingut del fitxer .p8 (PEM). `wrangler secret put`.
//   - APNS_KEY_ID      : Key ID de la clau APNs (Apple Developer > Keys).
//   - APNS_TEAM_ID     : Team ID del compte d'Apple Developer.
//   - APNS_TOPIC       : bundle id de l'app (com.bondiari.app).
//   - APNS_SANDBOX     : "1" per provar amb builds d'Xcode/TestFlight; buit/absent per producció.

const APNS_PREFIX = 'apns:'

function b64urlFromBytes(bytes) {
  let bin = ''
  const arr = new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlFromString(str) {
  return b64urlFromBytes(new TextEncoder().encode(str))
}
function pemToDer(pem) {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const der = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i)
  return der
}

// --- registre de tokens ------------------------------------------------------
function tokenKey(token) {
  return APNS_PREFIX + token
}

export async function handleApnsRegister(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method-not-allowed' }), {
      status: 405,
      headers: { allow: 'POST', 'content-type': 'application/json' },
    })
  }
  try {
    const body = await request.json()
    const token = (body?.token || '').trim()
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return new Response(JSON.stringify({ ok: false, error: 'bad-token' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }
    await env.STATS_KV.put(
      tokenKey(token),
      JSON.stringify({ token, createdAt: new Date().toISOString() }),
    )
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 500 })
  }
}

async function listTokens(env) {
  const tokens = []
  let cursor
  do {
    const page = await env.STATS_KV.list({ prefix: APNS_PREFIX, cursor })
    for (const k of page.keys) tokens.push(k.name.slice(APNS_PREFIX.length))
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return tokens
}

// --- JWT provider token (ES256) ---------------------------------------------
async function buildApnsJwt(env) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(env.APNS_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const header = b64urlFromString(JSON.stringify({ alg: 'ES256', kid: env.APNS_KEY_ID }))
  const payload = b64urlFromString(
    JSON.stringify({ iss: env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }),
  )
  const signingInput = new TextEncoder().encode(`${header}.${payload}`)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput)
  return `${header}.${payload}.${b64urlFromBytes(new Uint8Array(sig))}`
}

// Envia una notificació {title, body, url} a tots els dispositius iOS registrats.
// Neteja els tokens caducats (410 / BadDeviceToken). Best-effort: no llança.
export async function sendApnsToAll(env, notification) {
  if (!env.APNS_PRIVATE_KEY || !env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_TOPIC) {
    console.warn('[apns] falta configuració APNs; no s\'envia res.')
    return { sent: 0, failed: 0, removed: 0 }
  }
  const host = env.APNS_SANDBOX === '1' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
  const jwt = await buildApnsJwt(env)
  const payload = JSON.stringify({
    aps: {
      alert: { title: notification.title || 'El Bon Diari', body: notification.body || '' },
      sound: 'default',
    },
    url: notification.url || 'https://bondiari.com/',
  })

  const tokens = await listTokens(env)
  let sent = 0
  let failed = 0
  let removed = 0
  for (const token of tokens) {
    try {
      const res = await fetch(`https://${host}/3/device/${token}`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${jwt}`,
          'apns-topic': env.APNS_TOPIC,
          'apns-push-type': 'alert',
          'apns-priority': '10',
        },
        body: payload,
      })
      if (res.status === 200) {
        sent += 1
      } else if (res.status === 410) {
        await env.STATS_KV.delete(tokenKey(token))
        removed += 1
      } else {
        let reason = ''
        try {
          reason = (await res.json())?.reason || ''
        } catch {
          reason = ''
        }
        if (reason === 'BadDeviceToken' || reason === 'Unregistered') {
          await env.STATS_KV.delete(tokenKey(token))
          removed += 1
        } else {
          failed += 1
          console.warn(`[apns] ${res.status} ${reason} per a un token`)
        }
      }
    } catch (err) {
      failed += 1
      console.warn('[apns] error enviant', err)
    }
  }
  return { sent, failed, removed }
}
