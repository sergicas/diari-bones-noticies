// Notificacions push (Web Push, PWA) per a El Bon Diari.
// - handlePushSubscribe / handlePushUnsubscribe: guarden/treuen la subscripció
//   del navegador a STATS_KV (prefix "push:").
// - sendPushToAll: envia una notificació a tots els subscriptors, signant amb
//   VAPID (RFC 8292) i xifrant el payload amb aes128gcm (RFC 8291 + RFC 8188).
//
// Config necessària:
//   - VAPID_PUBLIC_KEY: clau pública (aquí sota, també usada al frontend).
//   - VAPID_PRIVATE_KEY: secret del Worker (`wrangler secret put VAPID_PRIVATE_KEY`).
//   - VAPID_SUBJECT: p. ex. "mailto:hola@bondiari.com".

export const VAPID_PUBLIC_KEY =
  'BCeqTqgGgg7f_acgcxXQC7_1IbJMYB9VPvV-i3VWgUVziV1Mrq9O4QJasPMBjyoT8_CleNWZoYOVHl2tGg9Mvvc'

const PUSH_PREFIX = 'push:'

// --- utils base64url ---------------------------------------------------------
function b64urlToBytes(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function bytesToB64url(bytes) {
  let bin = ''
  const arr = new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function concatBytes(...chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}
function utf8(str) {
  return new TextEncoder().encode(str)
}

// --- subscripcions -----------------------------------------------------------
function subKey(endpoint) {
  return PUSH_PREFIX + bytesToB64url(utf8(endpoint)).slice(0, 200)
}

export async function handlePushSubscribe(request, env) {
  try {
    const body = await request.json()
    const sub = body?.subscription || body
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return new Response(JSON.stringify({ ok: false, error: 'bad-subscription' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }
    const record = {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      createdAt: new Date().toISOString(),
    }
    await env.STATS_KV.put(subKey(sub.endpoint), JSON.stringify(record))
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}

export async function handlePushUnsubscribe(request, env) {
  try {
    const body = await request.json()
    const endpoint = body?.endpoint || body?.subscription?.endpoint
    if (endpoint) await env.STATS_KV.delete(subKey(endpoint))
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 500 })
  }
}

async function listSubscriptions(env) {
  const subs = []
  let cursor
  do {
    const page = await env.STATS_KV.list({ prefix: PUSH_PREFIX, cursor })
    for (const k of page.keys) {
      const rec = await env.STATS_KV.get(k.name, 'json')
      if (rec?.endpoint) subs.push({ key: k.name, ...rec })
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return subs
}

// --- VAPID JWT (ES256) -------------------------------------------------------
async function importVapidPrivateKey(env) {
  const d = b64urlToBytes(env.VAPID_PRIVATE_KEY)
  const pub = b64urlToBytes(VAPID_PUBLIC_KEY) // 65 bytes: 0x04 || X(32) || Y(32)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: bytesToB64url(d),
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true,
  }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

async function buildVapidAuth(env, endpoint) {
  const audience = new URL(endpoint).origin
  const header = bytesToB64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = bytesToB64url(
    utf8(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: env.VAPID_SUBJECT || 'mailto:hola@bondiari.com',
      }),
    ),
  )
  const signingInput = utf8(`${header}.${payload}`)
  const key = await importVapidPrivateKey(env)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput)
  const jwt = `${header}.${payload}.${bytesToB64url(new Uint8Array(sig))}`
  return `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`
}

// --- xifratge aes128gcm (RFC 8291 + 8188) ------------------------------------
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

async function encryptPayload(payloadBytes, uaPublicB64, authB64) {
  const uaPublic = b64urlToBytes(uaPublicB64) // 65 bytes
  const authSecret = b64urlToBytes(authB64)

  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey)) // 65

  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256),
  )

  const keyInfo = concatBytes(utf8('WebPush: info\0'), uaPublic, asPublicRaw)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)

  const plaintext = concatBytes(payloadBytes, new Uint8Array([2])) // 0x02 = últim registre
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plaintext),
  )

  const rs = new Uint8Array([0, 0, 0x10, 0]) // record size 4096
  const idlen = new Uint8Array([asPublicRaw.length]) // 65
  return concatBytes(salt, rs, idlen, asPublicRaw, ciphertext)
}

async function sendOne(env, sub, payloadBytes) {
  const authHeader = await buildVapidAuth(env, sub.endpoint)
  const body = await encryptPayload(payloadBytes, sub.p256dh, sub.auth)
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
    },
    body,
  })
  return res.status
}

// Envia una notificació {title, body, url, icon} a tots els subscriptors.
// Neteja les subscripcions caducades (404/410). Best-effort: no llança.
export async function sendPushToAll(env, notification) {
  if (!env.VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID_PRIVATE_KEY no configurada; no s\'envia res.')
    return { sent: 0, failed: 0, removed: 0 }
  }
  const payload = utf8(
    JSON.stringify({
      title: notification.title || 'El Bon Diari',
      body: notification.body || '',
      url: notification.url || 'https://bondiari.com/',
      icon: notification.icon || 'https://bondiari.com/logo-colibri.png',
    }),
  )
  const subs = await listSubscriptions(env)
  let sent = 0
  let failed = 0
  let removed = 0
  for (const sub of subs) {
    try {
      const status = await sendOne(env, sub, payload)
      if (status === 404 || status === 410) {
        await env.STATS_KV.delete(sub.key)
        removed += 1
      } else if (status >= 200 && status < 300) {
        sent += 1
      } else {
        failed += 1
      }
    } catch (err) {
      failed += 1
      console.warn('[push] error enviant', err)
    }
  }
  return { sent, failed, removed }
}
