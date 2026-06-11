// Butlletí setmanal de bondiari.com.
// - Subscripció single opt-in (validació de format només; la millora natural
//   futura serà double opt-in amb correu de confirmació).
// - Emmagatzematge: STATS_KV amb prefix `subscriber:<token>`.
// - Cron setmanal (configurat a wrangler.jsonc) que llegeix els subscriptors,
//   composa el digest HTML i l'envia per MailerSend si la API key està posada.
//   Si MAILERSEND_API_KEY no existeix, només es registra l'intent — així el
//   sistema funciona sense haver de configurar res mentre proves la subscripció.

const subscriberPrefix = 'subscriber:'

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

  const token = await tokenForEmail(email)
  const key = subscriberPrefix + token
  const existing = await env.STATS_KV.get(key, 'json')
  if (existing) {
    return jsonResponse({ ok: true, alreadySubscribed: true })
  }
  const record = {
    email,
    language,
    subscribedAt: new Date().toISOString(),
    source: payload?.source || 'web',
  }
  await env.STATS_KV.put(key, JSON.stringify(record))
  return jsonResponse({ ok: true, alreadySubscribed: false })
}

function unsubscribeConfirmationHtml(message) {
  return `<!DOCTYPE html><html lang="ca"><head><meta charset="utf-8"><title>Baixa del butlletí</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#FFFFFF;color:#000;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}
main{max-width:480px;border:2px solid #000;padding:32px}
a{color:#146356;font-weight:700}
h1{font-family:Georgia,serif;font-size:1.8rem;margin:0 0 12px}
</style></head>
<body><main><h1>${message.title}</h1><p>${message.body}</p><p><a href="https://bondiari.com/">Tornar a bondiari.com</a></p></main></body></html>`
}

export async function handleUnsubscribe(request, env) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) {
    return new Response(
      unsubscribeConfirmationHtml({
        title: 'Enllaç incomplet',
        body: 'El token de baixa no és vàlid. Si has rebut aquest enllaç per correu i no funciona, escriu-nos.',
      }),
      { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  }
  const key = subscriberPrefix + token
  const existed = await env.STATS_KV.get(key)
  if (existed) {
    await env.STATS_KV.delete(key)
  }
  return new Response(
    unsubscribeConfirmationHtml({
      title: existed ? 'Baixa confirmada' : 'Ja no estaves subscrit',
      body: existed
        ? 'Hem esborrat la teva adreça del butlletí. No tornaràs a rebre cap correu de bondiari fins que no et tornis a subscriure.'
        : 'Aquesta adreça no consta a la nostra llista. Potser ja la vas donar de baixa en una altra ocasió.',
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

const greetings = {
  ca: { hello: 'Bon diumenge', intro: 'Una tria de bones notícies de la setmana al diari constructiu.', cta: 'Llegir més a bondiari.com', unsub: "Baixa del butlletí" },
  es: { hello: 'Buen domingo', intro: 'Una selección de buenas noticias de la semana en el diario constructivo.', cta: 'Leer más en bondiari.com', unsub: 'Baja del boletín' },
  en: { hello: 'Sunday roundup', intro: 'A handful of good news from the constructive paper this week.', cta: 'Read more at bondiari.com', unsub: 'Unsubscribe' },
  fr: { hello: 'Bon dimanche', intro: 'Une sélection de bonnes nouvelles de la semaine au journal constructif.', cta: 'Lire plus sur bondiari.com', unsub: "Se désinscrire" },
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
  do {
    const list = await env.STATS_KV.list({ prefix: subscriberPrefix, cursor })
    for (const key of list.keys) {
      const data = await env.STATS_KV.get(key.name, 'json')
      if (!data?.email) continue
      const token = key.name.slice(subscriberPrefix.length)
      const unsubscribeUrl = `https://bondiari.com/api/newsletter/unsubscribe?token=${token}`
      const html = renderDigestEmail({
        language: data.language || 'ca',
        stories,
        unsubscribeUrl,
      })
      const subject = data.language === 'es' ? 'Buenas noticias del domingo · El Bon Diari'
        : data.language === 'en' ? "Sunday's good news · El Bon Diari"
        : data.language === 'fr' ? 'Les bonnes nouvelles du dimanche · El Bon Diari'
        : 'Bones notícies del diumenge · El Bon Diari'

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

  console.log(`[newsletter] sent=${sent} failed=${failed} logged-only=${logged}`)
  return { sent, failed, logged }
}
