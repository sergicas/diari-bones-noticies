// Butlletí setmanal de bondiari.com.
// - Double opt-in: la subscripció crea un record `status: 'pending'` i
//   envia un correu de confirmació. Només els confirmats reben el digest.
// - Rate-limit: 5 subscripcions/hora per IP i 50/hora globals (a STATS_KV
//   amb TTL d'una hora). Protegeix contra spammers i atacs distribuïts.
// - Emmagatzematge: STATS_KV amb prefix `subscriber:<token>`.
// - Cron setmanal (configurat a wrangler.jsonc) que llegeix els subscriptors
//   confirmats, composa el digest HTML i l'envia per MailerSend.

const subscriberPrefix = 'subscriber:'
const rateLimitIpPrefix = 'rl:subscribe:ip:'
const rateLimitGlobalPrefix = 'rl:subscribe:global:'
const RATE_LIMIT_PER_IP = 5
const RATE_LIMIT_GLOBAL = 50
const RATE_LIMIT_WINDOW_SECONDS = 3600

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

// Token = SHA-256 truncat de l'adreça normalitzada. Determinista perquè
// el mateix correu generi sempre la mateixa clau de KV (evita duplicats
// per a l'eventual consistency del `list`), però no exposa l'adreça a
// les URLs de baixa.
async function tokenForEmail(email) {
  const data = new TextEncoder().encode(email.trim().toLowerCase())
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 36)
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

  const ip = request.headers.get('CF-Connecting-IP') || ''
  const rate = await passesRateLimit(env, ip)
  if (!rate.ok) {
    return jsonResponse(
      { ok: false, error: 'rate-limited', reason: rate.reason },
      { status: 429, headers: { 'retry-after': String(RATE_LIMIT_WINDOW_SECONDS) } },
    )
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

  const token = await tokenForEmail(email)
  const key = subscriberPrefix + token
  const existing = await env.STATS_KV.get(key, 'json')

  // Tractem els subscriptors legacy (sense camp `status`, anteriors al
  // double opt-in) com a confirmats, perquè ja s'havien donat d'alta amb el
  // sistema antic. Així una resubscripció no els degrada a pendents.
  const isAlreadyActive = existing?.status === 'confirmed' || (existing && existing.status === undefined)
  if (isAlreadyActive) {
    return jsonResponse({ ok: true, alreadySubscribed: true, status: 'confirmed' })
  }

  // Si era pendent, refresquem la data per allargar el termini de confirmació.
  const record = {
    email,
    language,
    status: 'pending',
    subscribedAt: existing?.subscribedAt || new Date().toISOString(),
    lastPendingAt: new Date().toISOString(),
    confirmedAt: null,
    source: payload?.source || 'web',
  }
  await env.STATS_KV.put(key, JSON.stringify(record))

  // Enviem el correu de confirmació si la API key està configurada.
  const apiKey = env.MAILERSEND_API_KEY
  let confirmationSent = false
  if (apiKey) {
    const confirmUrl = `https://bondiari.com/api/newsletter/confirm?token=${token}`
    const unsubscribeUrl = `https://bondiari.com/api/newsletter/unsubscribe?token=${token}`
    const html = renderConfirmationEmail({ language, confirmUrl, unsubscribeUrl })
    const fromEmail = env.NEWSLETTER_FROM_EMAIL || 'butlleti@bondiari.com'
    const fromName = env.NEWSLETTER_FROM_NAME || 'El Bon Diari'
    const subject = subjectForLanguage(language, 'confirm')
    const result = await sendWithMailerSend({ apiKey, fromEmail, fromName, to: email, subject, html })
    confirmationSent = result.ok
    if (!result.ok) {
      console.warn(`[newsletter] No s'ha pogut enviar la confirmació a ${email} (${result.status})`)
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
  const key = subscriberPrefix + token
  const existing = await env.STATS_KV.get(key, 'json')
  if (!existing) {
    return htmlResponse(
      confirmationPageHtml({
        title: 'No trobem la teva subscripció',
        body: 'Pot ser que l\'enllaç hagi caducat o que ja hagis donat de baixa l\'adreça. Pots tornar-te a subscriure des de la portada.',
        isError: true,
      }),
      { status: 404 },
    )
  }
  if (existing.status === 'confirmed') {
    return htmlResponse(
      confirmationPageHtml({
        title: 'Ja estàs confirmat',
        body: 'La teva adreça ja era a la llista de confirmats. Diumenge a primera hora rebràs el primer butlletí.',
      }),
    )
  }
  const updated = {
    ...existing,
    status: 'confirmed',
    confirmedAt: new Date().toISOString(),
  }
  await env.STATS_KV.put(key, JSON.stringify(updated))
  return htmlResponse(
    confirmationPageHtml({
      title: 'Confirmat. Benvingut a Bondiari.',
      body: 'Ja estàs a la llista. Diumenge a les 9 del matí et trobaràs el primer correu amb les bones notícies de la setmana.',
    }),
  )
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
  const key = subscriberPrefix + token
  const existed = await env.STATS_KV.get(key)
  if (existed) {
    await env.STATS_KV.delete(key)
  }
  return htmlResponse(
    confirmationPageHtml({
      title: existed ? 'Baixa confirmada' : 'Ja no estaves subscrit',
      body: existed
        ? 'Hem esborrat la teva adreça del butlletí. No tornaràs a rebre cap correu de bondiari fins que no et tornis a subscriure.'
        : 'Aquesta adreça no consta a la nostra llista. Potser ja la vas donar de baixa en una altra ocasió.',
    }),
  )
}

// --- Plantilles HTML d'email -----------------------------------------------

const greetings = {
  ca: { hello: 'Bon diumenge', intro: 'Una tria de bones notícies de la setmana al diari constructiu.', cta: 'Llegir més a bondiari.com', unsub: 'Baixa del butlletí' },
  es: { hello: 'Buen domingo', intro: 'Una selección de buenas noticias de la semana en el diario constructivo.', cta: 'Leer más en bondiari.com', unsub: 'Baja del boletín' },
  en: { hello: 'Sunday roundup', intro: 'A handful of good news from the constructive paper this week.', cta: 'Read more at bondiari.com', unsub: 'Unsubscribe' },
  fr: { hello: 'Bon dimanche', intro: 'Une sélection de bonnes nouvelles de la semaine au journal constructif.', cta: 'Lire plus sur bondiari.com', unsub: 'Se désinscrire' },
}

const confirmationCopy = {
  ca: {
    subject: 'Confirma la subscripció · El Bon Diari',
    hello: 'Falta un pas: confirma el teu correu',
    intro: 'Hem rebut una sol·licitud de subscripció al butlletí de Bondiari amb aquesta adreça. Si ets tu, confirma-la amb el botó de sota i començaràs a rebre el digest cada diumenge al matí.',
    button: 'Confirmar la subscripció',
    note: 'Si no t\'hi has subscrit tu, no facis res — l\'enllaç caduca i mai t\'arribarà cap més correu.',
    unsub: 'Donar-me de baixa',
  },
  es: {
    subject: 'Confirma la suscripción · El Bon Diari',
    hello: 'Falta un paso: confirma tu correo',
    intro: 'Hemos recibido una solicitud de suscripción al boletín de Bondiari con esta dirección. Si eres tú, confírmala con el botón de abajo y empezarás a recibir el digest cada domingo por la mañana.',
    button: 'Confirmar la suscripción',
    note: 'Si no te has suscrito tú, no hagas nada — el enlace caduca y no recibirás ningún correo más.',
    unsub: 'Darme de baja',
  },
  en: {
    subject: 'Confirm your subscription · El Bon Diari',
    hello: 'One last step: confirm your email',
    intro: 'We received a subscription request to the Bondiari newsletter with this address. If it was you, confirm with the button below and you will start getting the digest every Sunday morning.',
    button: 'Confirm subscription',
    note: 'If you did not subscribe, just ignore this — the link expires and you will not get any more emails.',
    unsub: 'Unsubscribe',
  },
  fr: {
    subject: 'Confirmez votre abonnement · El Bon Diari',
    hello: 'Une dernière étape : confirmez votre adresse',
    intro: 'Nous avons reçu une demande d\'abonnement à la newsletter Bondiari avec cette adresse. Si c\'est vous, confirmez avec le bouton ci-dessous et vous recevrez la sélection chaque dimanche matin.',
    button: 'Confirmer l\'abonnement',
    note: 'Si ce n\'est pas vous, ignorez ce message — le lien expire et vous ne recevrez plus rien.',
    unsub: 'Se désinscrire',
  },
}

function subjectForLanguage(language, kind) {
  if (kind === 'confirm') {
    return (confirmationCopy[language] || confirmationCopy.ca).subject
  }
  if (language === 'es') return 'Buenas noticias del domingo · El Bon Diari'
  if (language === 'en') return "Sunday's good news · El Bon Diari"
  if (language === 'fr') return 'Les bonnes nouvelles du dimanche · El Bon Diari'
  return 'Bones notícies del diumenge · El Bon Diari'
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

async function sendWithMailerSend({ apiKey, fromEmail, fromName, to, subject, html }) {
  const response = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: fromEmail, name: fromName },
      to: [{ email: to }],
      subject,
      html,
    }),
  })
  return { ok: response.ok, status: response.status }
}

export async function sendWeeklyDigest(env) {
  const cache = await env.LIVE_NEWS_KV.get('latest', 'json')
  const stories = Array.isArray(cache?.stories) ? cache.stories.slice(0, 7) : []
  if (stories.length === 0) {
    console.warn('[newsletter] No hi ha notícies al cache; saltem el digest.')
    return { sent: 0, skipped: true }
  }

  const apiKey = env.MAILERSEND_API_KEY
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
      const token = key.name.slice(subscriberPrefix.length)
      const unsubscribeUrl = `https://bondiari.com/api/newsletter/unsubscribe?token=${token}`
      const html = renderDigestEmail({
        language: data.language || 'ca',
        stories,
        unsubscribeUrl,
      })
      const subject = subjectForLanguage(data.language || 'ca', 'digest')

      if (!apiKey) {
        console.log(`[newsletter] (sense MAILERSEND_API_KEY) hauria enviat a ${data.email}`)
        logged += 1
        continue
      }
      const result = await sendWithMailerSend({ apiKey, fromEmail, fromName, to: data.email, subject, html })
      if (result.ok) sent += 1
      else {
        failed += 1
        console.warn(`[newsletter] ${data.email} ha fallat (${result.status})`)
      }
    }
    cursor = list.list_complete ? null : list.cursor
  } while (cursor)

  console.log(`[newsletter] sent=${sent} failed=${failed} logged-only=${logged} skipped-unconfirmed=${skippedUnconfirmed}`)
  return { sent, failed, logged, skippedUnconfirmed }
}
