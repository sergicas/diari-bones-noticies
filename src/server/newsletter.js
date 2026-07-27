// Butlletí DIARI de bondiari.com (cada matí a les 7:00, hora de Madrid).
// - Double opt-in: la subscripció crea un record `status: 'pending'` i
//   envia un correu de confirmació. Només els confirmats reben el digest.
// - Rate-limit: 5 subscripcions/hora per IP i 50/hora globals (a STATS_KV
//   amb TTL d'una hora). Protegeix contra spammers i atacs distribuïts.
// - Emmagatzematge: STATS_KV amb una clau estable per correu i tokens d'acció
//   aleatoris separats per confirmar o donar-se de baixa.
// - Cron diari (configurat a wrangler.jsonc) que llegeix els subscriptors
//   confirmats, composa el digest HTML i l'envia per Resend.

import {
  deleteNewsletterSubscriberMirror,
  mirrorNewsletterSubscriber,
} from './editorialStore.js'

const subscriberPrefix = 'subscriber:'
const actionTokenPrefix = 'newsletter-action:'
const rateLimitIpPrefix = 'rl:subscribe:ip:'
const rateLimitGlobalPrefix = 'rl:subscribe:global:'
const RATE_LIMIT_PER_IP = 5
const RATE_LIMIT_GLOBAL = 50
const RATE_LIMIT_WINDOW_SECONDS = 3600
const PENDING_TTL_SECONDS = 7 * 24 * 60 * 60
const ADMIN_SUBSCRIBER_LIMIT = 250

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  })
}

function htmlResponse(body, init = {}) {
  return new Response(body, {
    ...init,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  })
}

function isValidEmail(value) {
  if (typeof value !== 'string') return false
  if (value.length > 254) return false
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value.trim())
}

// Identificador intern determinista per evitar duplicats. No s'exposa mai a
// URLs: els enllaços sensibles fan servir un token aleatori independent.
async function subscriberIdForEmail(email) {
  const data = new TextEncoder().encode(email.trim().toLowerCase())
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 36)
}

function createActionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function isSecureActionToken(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

async function persistSubscriber(kv, key, record, { pending = false } = {}) {
  const actionToken = isSecureActionToken(record.actionToken)
    ? record.actionToken
    : createActionToken()
  const next = { ...record, actionToken }
  const options = pending ? { expirationTtl: PENDING_TTL_SECONDS } : undefined
  await Promise.all([
    kv.put(key, JSON.stringify(next), options),
    kv.put(actionTokenPrefix + actionToken, key, options),
  ])
  return next
}

async function mirrorSubscriberSafely(env, key, record) {
  try {
    await mirrorNewsletterSubscriber(
      env,
      key.replace(subscriberPrefix, ''),
      record,
    )
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'newsletter.d1-mirror.failed',
        subscriberId: key.slice(-8),
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

async function resolveSubscriber(kv, token) {
  if (isSecureActionToken(token)) {
    const key = await kv.get(actionTokenPrefix + token)
    if (!key?.startsWith(subscriberPrefix)) return null
    const record = await kv.get(key, 'json')
    return record?.actionToken === token ? { key, record } : null
  }

  // Compatibilitat temporal amb enllaços creats abans dels tokens aleatoris.
  // Deixen de funcionar tan bon punt el registre es migra al format segur.
  if (/^[a-f0-9]{36}$/i.test(token)) {
    const key = subscriberPrefix + token
    const record = await kv.get(key, 'json')
    if (record && !isSecureActionToken(record.actionToken)) return { key, record }
  }
  return null
}

// --- Rate limit ------------------------------------------------------------

function currentHourBucket() {
  return Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_SECONDS)
}

async function checkAndIncrement(kv, key, limit) {
  const current = parseInt((await kv.get(key)) || '0', 10)
  if (current >= limit) return { allowed: false, current }
  await kv.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS })
  return { allowed: true, current: current + 1 }
}

async function passesRateLimit(env, ip) {
  const bucket = currentHourBucket()
  const globalKey = `${rateLimitGlobalPrefix}${bucket}`
  const globalCheck = await checkAndIncrement(env.STATS_KV, globalKey, RATE_LIMIT_GLOBAL)
  if (!globalCheck.allowed) return { ok: false, reason: 'global' }
  if (!ip) return { ok: true }
  const ipKey = `${rateLimitIpPrefix}${ip}:${bucket}`
  const ipCheck = await checkAndIncrement(env.STATS_KV, ipKey, RATE_LIMIT_PER_IP)
  if (!ipCheck.allowed) return { ok: false, reason: 'ip' }
  return { ok: true }
}

// --- Subscribe (amb double opt-in) ----------------------------------------

export async function handleSubscribe(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method-not-allowed' }, { status: 405 })
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ ok: false, error: 'invalid-json' }, { status: 400 })
  }
  const email = String(payload?.email || '').trim().toLowerCase()
  const language = ['ca', 'es', 'en', 'fr'].includes(payload?.language) ? payload.language : 'ca'
  if (!isValidEmail(email)) {
    return jsonResponse({ ok: false, error: 'invalid-email' }, { status: 422 })
  }

  const ip = request.headers.get('CF-Connecting-IP') || ''
  const rate = await passesRateLimit(env, ip)
  if (!rate.ok) {
    return jsonResponse(
      { ok: false, error: 'rate-limited', reason: rate.reason },
      { status: 429, headers: { 'retry-after': String(RATE_LIMIT_WINDOW_SECONDS) } },
    )
  }

  const subscriberId = await subscriberIdForEmail(email)
  const key = subscriberPrefix + subscriberId
  const existing = await env.STATS_KV.get(key, 'json')

  // Tractem els subscriptors legacy (sense camp `status`, anteriors al
  // double opt-in) com a confirmats, perquè ja s'havien donat d'alta amb el
  // sistema antic. Així una resubscripció no els degrada a pendents.
  const isAlreadyActive = existing?.status === 'confirmed' || (existing && existing.status === undefined)
  if (isAlreadyActive) {
    return jsonResponse({ ok: true, alreadySubscribed: true, status: 'confirmed' })
  }

  // Si era pendent, refresquem la data per allargar el termini de confirmació.
  const record = await persistSubscriber(env.STATS_KV, key, {
    email,
    language,
    status: 'pending',
    subscribedAt: existing?.subscribedAt || new Date().toISOString(),
    lastPendingAt: new Date().toISOString(),
    confirmedAt: null,
    source: payload?.source || 'web',
    actionToken: existing?.actionToken,
  }, { pending: true })
  await mirrorSubscriberSafely(env, key, record)

  // Enviem el correu de confirmació si la API key està configurada.
  const apiKey = env.RESEND_API_KEY
  let confirmationSent = false
  if (apiKey) {
    const confirmUrl = `https://bondiari.com/api/newsletter/confirm?token=${record.actionToken}`
    const unsubscribeUrl = `https://bondiari.com/api/newsletter/unsubscribe?token=${record.actionToken}`
    const html = renderConfirmationEmail({ language, confirmUrl, unsubscribeUrl })
    const text = renderConfirmationText({ language, confirmUrl, unsubscribeUrl })
    const fromEmail = env.NEWSLETTER_FROM_EMAIL || 'butlleti@bondiari.com'
    const fromName = env.NEWSLETTER_FROM_NAME || 'El Bon Diari'
    const subject = subjectForLanguage(language, 'confirm')
    const result = await sendWithResend({ apiKey, fromEmail, fromName, to: email, subject, html, text })
    confirmationSent = result.ok
    if (!result.ok) {
      console.warn(
        JSON.stringify({
          message: 'newsletter confirmation failed',
          subscriberId: subscriberId.slice(-8),
          status: result.status,
        }),
      )
    }
  }

  return jsonResponse({
    ok: true,
    alreadySubscribed: false,
    status: 'pending',
    confirmationSent,
  })
}

// --- Confirmation ----------------------------------------------------------

function confirmationPageHtml({ title, body, isError = false }) {
  return `<!DOCTYPE html><html lang="ca"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:${isError ? '#FFFFFF' : '#FFE000'};color:#000;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}
main{max-width:480px;border:2px solid #000;background:#FFFFFF;padding:32px}
a{color:#146356;font-weight:700}
h1{font-family:Georgia,serif;font-size:1.8rem;margin:0 0 12px}
p{font-size:1rem;line-height:1.5;margin:0 0 16px}
</style></head>
<body><main><h1>${title}</h1><p>${body}</p><p><a href="https://bondiari.com/">Tornar a bondiari.com</a></p></main></body></html>`
}

export async function handleConfirm(request, env) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) {
    return htmlResponse(
      confirmationPageHtml({
        title: 'Enllaç de confirmació incomplet',
        body: 'Falta el token. Torna a clicar el lligam que t\'hem enviat per correu.',
        isError: true,
      }),
      { status: 400 },
    )
  }
  const resolved = await resolveSubscriber(env.STATS_KV, token)
  if (!resolved) {
    return htmlResponse(
      confirmationPageHtml({
        title: 'No trobem la teva subscripció',
        body: 'Pot ser que l\'enllaç hagi caducat o que ja hagis donat de baixa l\'adreça. Pots tornar-te a subscriure des de la portada.',
        isError: true,
      }),
      { status: 404 },
    )
  }
  const { key, record: existing } = resolved
  if (existing.status === 'confirmed') {
    const confirmed = await persistSubscriber(env.STATS_KV, key, existing)
    await mirrorSubscriberSafely(env, key, confirmed)
    return htmlResponse(
      confirmationPageHtml({
        title: 'Ja estàs confirmat',
        body: 'La teva adreça ja era a la llista de confirmats. Cada matí a les 7 rebràs la selecció útil del dia.',
      }),
    )
  }
  const updated = await persistSubscriber(env.STATS_KV, key, {
    ...existing,
    status: 'confirmed',
    confirmedAt: new Date().toISOString(),
  })
  await mirrorSubscriberSafely(env, key, updated)

  // Correu de BENVINGUDA (best-effort): no bloqueja ni trenca la confirmació si
  // Resend falla. Fidelitza el nou subscriptor i el convida a compartir.
  const apiKey = env.RESEND_API_KEY
  if (apiKey && existing.email) {
    try {
      const language = existing.language || 'ca'
      const unsubscribeUrl = `https://bondiari.com/api/newsletter/unsubscribe?token=${updated.actionToken}`
      const html = renderWelcomeEmail({ language, unsubscribeUrl })
      const text = renderWelcomeText({ language, unsubscribeUrl })
      const fromEmail = env.NEWSLETTER_FROM_EMAIL || 'butlleti@bondiari.com'
      const fromName = env.NEWSLETTER_FROM_NAME || 'El Bon Diari'
      const subject = subjectForLanguage(language, 'welcome')
      const result = await sendWithResend({ apiKey, fromEmail, fromName, to: existing.email, subject, html, text })
      if (!result.ok) {
        console.warn(
          JSON.stringify({
            message: 'newsletter welcome failed',
            subscriberId: key.slice(-8),
            status: result.status,
          }),
        )
      }
    } catch (err) {
      console.warn('[newsletter] error enviant el correu de benvinguda', err)
    }
  }

  return htmlResponse(
    confirmationPageHtml({
      title: 'Confirmat. Benvingut a Bondiari.',
      body: 'Ja estàs a la llista. Cada matí a les 7 et trobaràs un correu amb la selecció útil del dia. T\'hem enviat també un correu de benvinguda.',
    }),
  )
}

// --- Stats públiques del butlletí (per al formulari) ---------------------

export async function handleNewsletterStats(request, env) {
  const audience = await readNewsletterAudience(env)
  return jsonResponse(
    {
      confirmed: audience.confirmed,
      pending: audience.pending,
    },
    { headers: { 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' } },
  )
}

function normalizedSubscriberStatus(record) {
  if (record?.status === 'pending') return 'pending'
  if (record?.status === 'unsubscribed') return 'unsubscribed'
  return 'confirmed'
}

function isExpiredPending(record, now = Date.now()) {
  if (normalizedSubscriberStatus(record) !== 'pending') return false
  const reference = Date.parse(record?.lastPendingAt || record?.subscribedAt || '')
  if (!Number.isFinite(reference)) return false
  return now - reference > PENDING_TTL_SECONDS * 1000
}

/**
 * Retorna una vista administrativa sanejada de la llista canònica del
 * butlletí. Deliberadament no inclou actionToken ni cap clau interna.
 */
export async function readNewsletterAudience(env, { limit = ADMIN_SUBSCRIBER_LIMIT } = {}) {
  if (!env?.STATS_KV?.list || !env?.STATS_KV?.get) {
    return {
      available: false,
      confirmed: 0,
      pending: 0,
      expiredPending: 0,
      total: 0,
      truncated: false,
      subscribers: [],
    }
  }

  const safeLimit = Math.max(1, Math.min(ADMIN_SUBSCRIBER_LIMIT, Number(limit) || 1))
  let cursor
  let truncated = false
  const subscribers = []

  do {
    const list = await env.STATS_KV.list({ prefix: subscriberPrefix, cursor })
    for (const key of list.keys) {
      if (subscribers.length >= safeLimit) {
        truncated = true
        break
      }

      const record = await env.STATS_KV.get(key.name, 'json')
      if (!record?.email) continue
      const status = normalizedSubscriberStatus(record)
      subscribers.push({
        email: record.email,
        language: record.language || 'ca',
        status,
        source: record.source || 'legacy',
        subscribedAt: record.subscribedAt || null,
        confirmedAt: record.confirmedAt || null,
        lastPendingAt: record.lastPendingAt || null,
        expired: isExpiredPending(record),
      })
    }

    if (truncated) break
    cursor = list.list_complete ? null : list.cursor
  } while (cursor)

  subscribers.sort((left, right) => {
    const leftDate = Date.parse(left.confirmedAt || left.subscribedAt || '') || 0
    const rightDate = Date.parse(right.confirmedAt || right.subscribedAt || '') || 0
    return rightDate - leftDate
  })

  const confirmed = subscribers.filter((record) => record.status === 'confirmed').length
  const pending = subscribers.filter((record) => record.status === 'pending').length
  const expiredPending = subscribers.filter(
    (record) => record.status === 'pending' && record.expired,
  ).length

  return {
    available: true,
    confirmed,
    pending,
    expiredPending,
    total: subscribers.length,
    truncated,
    subscribers,
  }
}

// --- Unsubscribe -----------------------------------------------------------

export async function handleUnsubscribe(request, env) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) {
    return htmlResponse(
      confirmationPageHtml({
        title: 'Enllaç incomplet',
        body: 'El token de baixa no és vàlid. Si has rebut aquest enllaç per correu i no funciona, escriu-nos.',
        isError: true,
      }),
      { status: 400 },
    )
  }
  const resolved = await resolveSubscriber(env.STATS_KV, token)
  if (resolved) {
    await Promise.all([
      env.STATS_KV.delete(resolved.key),
      isSecureActionToken(resolved.record.actionToken)
        ? env.STATS_KV.delete(actionTokenPrefix + resolved.record.actionToken)
        : Promise.resolve(),
    ])
    try {
      await deleteNewsletterSubscriberMirror(
        env,
        resolved.key.replace(subscriberPrefix, ''),
      )
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'newsletter.d1-delete.failed',
          subscriberId: resolved.key.slice(-8),
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }
  return htmlResponse(
    confirmationPageHtml({
      title: resolved ? 'Baixa confirmada' : 'Ja no estaves subscrit',
      body: resolved
        ? 'Hem esborrat la teva adreça del butlletí. No tornaràs a rebre cap correu de bondiari fins que no et tornis a subscriure.'
        : 'Aquesta adreça no consta a la nostra llista. Potser ja la vas donar de baixa en una altra ocasió.',
    }),
  )
}

// --- Plantilles HTML d'email -----------------------------------------------

const greetings = {
  ca: { hello: 'Bon dia', intro: "La selecció constructiva d'avui: solucions, verificacions i informació útil.", cta: 'Llegir més a bondiari.com', unsub: 'Baixa del butlletí' },
  es: { hello: 'Buenos días', intro: 'La selección constructiva de hoy: soluciones, verificaciones e información útil.', cta: 'Leer más en bondiari.com', unsub: 'Baja del boletín' },
  en: { hello: 'Good morning', intro: "Today's constructive briefing: solutions, fact-checks and useful information.", cta: 'Read more at bondiari.com', unsub: 'Unsubscribe' },
  fr: { hello: 'Bonjour', intro: "La sélection constructive du jour : solutions, vérifications et informations utiles.", cta: 'Lire plus sur bondiari.com', unsub: 'Se désinscrire' },
}

const confirmationCopy = {
  ca: {
    subject: 'Confirma la subscripció · El Bon Diari',
    hello: 'Falta un pas: confirma el teu correu',
    intro: 'Hem rebut una sol·licitud de subscripció al butlletí de Bondiari amb aquesta adreça. Si ets tu, confirma-la amb el botó de sota i començaràs a rebre la selecció constructiva cada matí a les 7.',
    button: 'Confirmar la subscripció',
    note: 'Si no t\'hi has subscrit tu, no facis res — l\'enllaç caduca i mai t\'arribarà cap més correu.',
    unsub: 'Donar-me de baixa',
  },
  es: {
    subject: 'Confirma la suscripción · El Bon Diari',
    hello: 'Falta un paso: confirma tu correo',
    intro: 'Hemos recibido una solicitud de suscripción al boletín de Bondiari con esta dirección. Si eres tú, confírmala con el botón de abajo y empezarás a recibir la selección constructiva cada mañana a las 7.',
    button: 'Confirmar la suscripción',
    note: 'Si no te has suscrito tú, no hagas nada — el enlace caduca y no recibirás ningún correo más.',
    unsub: 'Darme de baja',
  },
  en: {
    subject: 'Confirm your subscription · El Bon Diari',
    hello: 'One last step: confirm your email',
    intro: 'We received a subscription request to the Bondiari newsletter with this address. If it was you, confirm below and you will start getting the constructive briefing every morning at 7.',
    button: 'Confirm subscription',
    note: 'If you did not subscribe, just ignore this — the link expires and you will not get any more emails.',
    unsub: 'Unsubscribe',
  },
  fr: {
    subject: 'Confirmez votre abonnement · El Bon Diari',
    hello: 'Une dernière étape : confirmez votre adresse',
    intro: 'Nous avons reçu une demande d\'abonnement à la newsletter Bondiari avec cette adresse. Si c\'est vous, confirmez ci-dessous et vous recevrez la sélection constructive chaque matin à 7h.',
    button: 'Confirmer l\'abonnement',
    note: 'Si ce n\'est pas vous, ignorez ce message — le lien expire et vous ne recevrez plus rien.',
    unsub: 'Se désinscrire',
  },
}

function subjectForLanguage(language, kind) {
  if (kind === 'confirm') {
    return (confirmationCopy[language] || confirmationCopy.ca).subject
  }
  if (kind === 'welcome') {
    return (welcomeCopy[language] || welcomeCopy.ca).subject
  }
  if (language === 'es') return 'La selección constructiva de hoy · El Bon Diari'
  if (language === 'en') return "Today's constructive briefing · El Bon Diari"
  if (language === 'fr') return 'La sélection constructive du jour · El Bon Diari'
  return "La selecció constructiva d'avui · El Bon Diari"
}

export function renderConfirmationEmail({ language = 'ca', confirmUrl, unsubscribeUrl }) {
  const lang = confirmationCopy[language] ? language : 'ca'
  const c = confirmationCopy[lang]
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${c.subject}</title></head>
<body style="margin:0;padding:0;background:#F4F1EA;color:#000;font-family:Georgia,Times New Roman,serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" style="max-width:520px;background:#FFFFFF;border:2px solid #000" cellpadding="0" cellspacing="0">
      <tr><td style="padding:28px 28px 8px">
        <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#146356;font-weight:800">El Bon Diari</div>
        <h1 style="margin:8px 0 4px;font-family:Georgia,serif;font-size:28px;letter-spacing:-.02em">${c.hello}</h1>
      </td></tr>
      <tr><td style="padding:8px 28px 16px">
        <p style="margin:0 0 16px;color:#222;font-size:15px;line-height:1.5">${c.intro}</p>
      </td></tr>
      <tr><td style="padding:8px 28px 24px;text-align:center">
        <a href="${confirmUrl}" style="display:inline-block;background:#000;color:#FFFFFF;text-decoration:none;padding:14px 26px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:14px;border:2px solid #000">${c.button}</a>
      </td></tr>
      <tr><td style="padding:8px 28px 24px">
        <p style="margin:0;color:#666;font-size:13px;line-height:1.5">${c.note}</p>
      </td></tr>
      <tr><td style="padding:14px 28px;border-top:1px solid #EEE;font-size:12px;color:#666;text-align:center">
        <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline">${c.unsub}</a>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`
}

// Versió de TEXT PLA del correu de confirmació. Enviar-la al costat de l'HTML
// apuja molt la nota anti-brossa (Apple/iCloud i Gmail penalitzen els correus
// només-HTML); és una de les millores de deliverability més efectives.
export function renderConfirmationText({ language = 'ca', confirmUrl, unsubscribeUrl }) {
  const lang = confirmationCopy[language] ? language : 'ca'
  const c = confirmationCopy[lang]
  return [
    c.hello,
    '',
    c.intro,
    '',
    `${c.button}: ${confirmUrl}`,
    '',
    c.note,
    '',
    '— El Bon Diari · bondiari.com',
    `${c.unsub}: ${unsubscribeUrl}`,
  ].join('\n')
}

// --- Correu de BENVINGUDA (s'envia en confirmar la subscripció) -------------
// Fidelitza el nou subscriptor: confirma el valor, marca l'expectativa (cada
// matí a les 7) i convida a compartir i a seguir les xarxes. Un dels correus
// amb més retorn de tota la seqüència.
const welcomeCopy = {
  ca: {
    subject: 'Ja hi ets. Benvingut/da a El Bon Diari',
    hello: 'Ja hi ets!',
    intro:
      'Gràcies per sumar-te a El Bon Diari. Cada matí a les 7 rebràs un correu curt amb solucions, verificacions i informació útil.',
    button: 'Comença a llegir',
    tip: 'Un favor petit: si coneixes algú a qui li pugui servir, reenvia-li aquest correu o comparteix bondiari.com. Així ens ajudes a créixer.',
    unsub: 'Donar-me de baixa',
  },
  es: {
    subject: 'Ya estás dentro. Bienvenido/a a El Bon Diari',
    hello: '¡Ya estás dentro!',
    intro:
      'Gracias por sumarte a El Bon Diari. Cada mañana a las 7 recibirás un correo breve con soluciones, verificaciones e información útil.',
    button: 'Empieza a leer',
    tip: 'Un favor: si conoces a alguien a quien pueda servirle, reenvíale este correo o comparte bondiari.com.',
    unsub: 'Darme de baja',
  },
  en: {
    subject: "You're in. Welcome to El Bon Diari",
    hello: "You're in!",
    intro:
      "Thanks for joining El Bon Diari. Every morning at 7 you'll get a short email with solutions, fact-checks and useful information.",
    button: 'Start reading',
    tip: 'A small favour: if you know someone who may find it useful, forward this email or share bondiari.com.',
    unsub: 'Unsubscribe',
  },
  fr: {
    subject: 'Vous y êtes. Bienvenue à El Bon Diari',
    hello: 'Vous y êtes !',
    intro:
      'Merci de rejoindre El Bon Diari. Chaque matin à 7h, vous recevrez un court e-mail avec des solutions, des vérifications et des informations utiles.',
    button: 'Commencer à lire',
    tip: "Un petit service : si vous connaissez quelqu'un à qui cela pourrait être utile, transférez cet e-mail ou partagez bondiari.com.",
    unsub: 'Se désabonner',
  },
}

export function renderWelcomeEmail({ language = 'ca', siteUrl = 'https://bondiari.com', unsubscribeUrl }) {
  const lang = welcomeCopy[language] ? language : 'ca'
  const c = welcomeCopy[lang]
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${c.subject}</title></head>
<body style="margin:0;padding:0;background:#F4F1EA;color:#000;font-family:Georgia,Times New Roman,serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" style="max-width:520px;background:#FFFFFF;border:2px solid #000" cellpadding="0" cellspacing="0">
      <tr><td style="padding:28px 28px 8px">
        <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#146356;font-weight:800">El Bon Diari</div>
        <h1 style="margin:8px 0 4px;font-family:Georgia,serif;font-size:28px;letter-spacing:-.02em">${c.hello}</h1>
      </td></tr>
      <tr><td style="padding:8px 28px 16px">
        <p style="margin:0 0 16px;color:#222;font-size:15px;line-height:1.5">${c.intro}</p>
      </td></tr>
      <tr><td style="padding:8px 28px 24px;text-align:center">
        <a href="${siteUrl}" style="display:inline-block;background:#000;color:#FFFFFF;text-decoration:none;padding:14px 26px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:14px;border:2px solid #000">${c.button}</a>
      </td></tr>
      <tr><td style="padding:8px 28px 24px">
        <p style="margin:0;color:#666;font-size:13px;line-height:1.5">${c.tip}</p>
      </td></tr>
      <tr><td style="padding:14px 28px;border-top:1px solid #EEE;font-size:12px;color:#666;text-align:center">
        <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline">${c.unsub}</a>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`
}

export function renderWelcomeText({ language = 'ca', siteUrl = 'https://bondiari.com', unsubscribeUrl }) {
  const lang = welcomeCopy[language] ? language : 'ca'
  const c = welcomeCopy[lang]
  return [
    c.hello,
    '',
    c.intro,
    '',
    `${c.button}: ${siteUrl}`,
    '',
    c.tip,
    '',
    '— El Bon Diari · bondiari.com',
    `${c.unsub}: ${unsubscribeUrl}`,
  ].join('\n')
}

export function renderDigestEmail({ language = 'ca', stories, unsubscribeUrl }) {
  const lang = greetings[language] ? language : 'ca'
  const g = greetings[lang]
  const items = stories
    .map((story) => {
      const safeTitle = story.title.replace(/</g, '&lt;')
      const safeSummary = (story.summary || '').replace(/</g, '&lt;')
      const safeSource = (story.source || '').replace(/</g, '&lt;')
      return `<tr><td style="padding:14px 0;border-bottom:1px solid #E5E5E5">
<a href="${story.url}" style="color:#000;text-decoration:none;font-weight:700;font-size:18px;line-height:1.25;display:block;margin-bottom:6px">${safeTitle}</a>
<div style="color:#666;font-size:13px;margin-bottom:8px"><strong>${safeSource}</strong> · ${story.category || ''}</div>
<div style="color:#222;font-size:15px;line-height:1.4">${safeSummary}</div>
</td></tr>`
    })
    .join('\n')
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>El Bon Diari</title></head>
<body style="margin:0;padding:0;background:#F4F1EA;color:#000;font-family:Georgia,Times New Roman,serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" style="max-width:560px;background:#FFFFFF;border:2px solid #000" cellpadding="0" cellspacing="0">
      <tr><td style="padding:28px 28px 8px">
        <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#146356;font-weight:800">El Bon Diari</div>
        <h1 style="margin:8px 0 4px;font-family:Georgia,serif;font-size:30px;letter-spacing:-.02em">${g.hello}</h1>
        <p style="margin:0;color:#444;font-size:15px;line-height:1.4">${g.intro}</p>
      </td></tr>
      <tr><td style="padding:16px 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
      </td></tr>
      <tr><td style="padding:24px 28px;background:#FFE000;text-align:center;border-top:2px solid #000">
        <a href="https://bondiari.com/" style="color:#000;font-weight:800;text-decoration:none;font-size:15px;letter-spacing:.05em;text-transform:uppercase">${g.cta}</a>
      </td></tr>
      <tr><td style="padding:18px 28px;font-size:12px;color:#666;text-align:center">
        <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline">${g.unsub}</a>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`
}

// Versió de text pla del butlletí diari (mateixa raó: deliverability anti-brossa).
export function renderDigestText({ language = 'ca', stories, unsubscribeUrl }) {
  const lang = greetings[language] ? language : 'ca'
  const g = greetings[lang]
  const items = stories
    .map((s) => `• ${s.title}${s.source ? ` (${s.source})` : ''}\n  ${s.url}`)
    .join('\n\n')
  return [
    g.hello,
    g.intro,
    '',
    items,
    '',
    `${g.cta}: https://bondiari.com/`,
    `${g.unsub}: ${unsubscribeUrl}`,
  ].join('\n')
}

// Resend és el proveïdor d'enviament actual. La key viu a env.RESEND_API_KEY.
// El "from" va com a una sola cadena "Name <email>" — diferent de MailerSend
// que ho separava en objecte.
async function sendWithResend({ apiKey, fromEmail, fromName, to, subject, html, text }) {
  const payload = {
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject,
    html,
  }
  // La versió de text pla és clau per a la deliverability (sobretot iCloud).
  if (text) payload.text = text
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return { ok: response.ok, status: response.status }
}

export async function sendDailyDigest(env) {
  const cache = await env.LIVE_NEWS_KV.get('latest', 'json')
  const stories = Array.isArray(cache?.stories) ? cache.stories.slice(0, 6) : []
  if (stories.length === 0) {
    console.warn('[newsletter] No hi ha notícies al cache; saltem el digest.')
    return { sent: 0, skipped: true }
  }

  const apiKey = env.RESEND_API_KEY
  const fromEmail = env.NEWSLETTER_FROM_EMAIL || 'butlleti@bondiari.com'
  const fromName = env.NEWSLETTER_FROM_NAME || 'El Bon Diari'

  let cursor
  let sent = 0
  let failed = 0
  let logged = 0
  let skippedUnconfirmed = 0
  do {
    const list = await env.STATS_KV.list({ prefix: subscriberPrefix, cursor })
    for (const key of list.keys) {
      const data = await env.STATS_KV.get(key.name, 'json')
      if (!data?.email) continue
      // Filtrem només els subscriptors confirmats. Els legacy sense camp
      // `status` (creats abans del double opt-in) també compten com a
      // confirmats per no perdre ningú existent.
      const isConfirmed = data.status === 'confirmed' || data.status === undefined
      if (!isConfirmed) {
        skippedUnconfirmed += 1
        continue
      }
      let subscriber = data
      if (!isSecureActionToken(subscriber.actionToken)) {
        subscriber = await persistSubscriber(env.STATS_KV, key.name, subscriber)
      }
      const unsubscribeUrl = `https://bondiari.com/api/newsletter/unsubscribe?token=${subscriber.actionToken}`
      const html = renderDigestEmail({
        language: data.language || 'ca',
        stories,
        unsubscribeUrl,
      })
      const text = renderDigestText({
        language: data.language || 'ca',
        stories,
        unsubscribeUrl,
      })
      const subject = subjectForLanguage(data.language || 'ca', 'digest')

      if (!apiKey) {
        logged += 1
        continue
      }
      const result = await sendWithResend({ apiKey, fromEmail, fromName, to: data.email, subject, html, text })
      if (result.ok) sent += 1
      else {
        failed += 1
        console.warn(
          JSON.stringify({
            message: 'newsletter digest failed',
            subscriberId: key.name.slice(-8),
            status: result.status,
          }),
        )
      }
    }
    cursor = list.list_complete ? null : list.cursor
  } while (cursor)

  console.log(`[newsletter] sent=${sent} failed=${failed} logged-only=${logged} skipped-unconfirmed=${skippedUnconfirmed}`)
  return { sent, failed, logged, skippedUnconfirmed }
}

export async function backfillNewsletterSubscribers(env) {
  let cursor
  let mirrored = 0
  let skipped = 0
  do {
    const list = await env.STATS_KV.list({ prefix: subscriberPrefix, cursor })
    for (const key of list.keys) {
      const record = await env.STATS_KV.get(key.name, 'json')
      if (!record?.email) {
        skipped += 1
        continue
      }
      const normalized = isSecureActionToken(record.actionToken)
        ? record
        : await persistSubscriber(env.STATS_KV, key.name, record)
      await mirrorNewsletterSubscriber(
        env,
        key.name.replace(subscriberPrefix, ''),
        {
          ...normalized,
          status: normalized.status || 'confirmed',
        },
      )
      mirrored += 1
    }
    cursor = list.list_complete ? null : list.cursor
  } while (cursor)
  return { mirrored, skipped }
}
