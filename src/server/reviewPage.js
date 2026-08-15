// LA SALA DE REVISIÓ
//
// Pàgina privada on una persona llegeix les peces que el radar ha preparat i
// decideix, una per una, si surten al diari. Vegeu `reviewGate.js` per a la
// regla; aquí només hi ha la porta d'entrada i la taula de treball.
//
// Fets a propòsit:
// - HTML pla i formularis, sense gens de JavaScript: així funciona al mòbil,
//   amb mala cobertura i encara que el navegador sigui vell.
// - Contrasenya una vegada per aparell, guardada en una galeta que dura tres
//   mesos. Res de tokens dins de l'URL: acabarien escrits a registres i
//   historials.
// - Cap enllaç d'aprovar per correu. Alguns programes de correu obren els
//   enllaços sols per previsualitzar-los i aprovarien peces sense que ningú
//   les hagi llegides.

import { agrupaPerEsdeveniment } from '../lib/event-dedupe.js'
import {
  countPendingCandidates,
  countPendingLive,
  listAssistantDecisions,
  decideCandidate,
  expireStaleCandidates,
  listPendingCandidates,
} from './reviewGate.js'

const COOKIE_NAME = 'bondiari_revisio'
const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function reviewSecret(env) {
  return env?.BONDIARI_REVIEW_PASSWORD || ''
}

async function sessionValue(password) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`bondiari-revisio:${password}`),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || ''
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return ''
}

function timingSafeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

async function isReviewer(request, env) {
  const secret = reviewSecret(env)
  if (!secret) return false
  const cookie = readCookie(request, COOKIE_NAME)
  if (!cookie) return false
  return timingSafeEqual(cookie, await sessionValue(secret))
}

const STYLES = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 1rem;
    font-family: Georgia, 'Times New Roman', serif;
    line-height: 1.55; color: #1c1c1c; background: #f6f3ec;
    max-width: 46rem; margin-inline: auto;
  }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
  .compte { color: #5a5a5a; margin: 0 0 1.5rem; font-size: .95rem; }
  .peca {
    background: #fff; border: 1px solid #e2ddd2; border-radius: 10px;
    padding: 1rem; margin-bottom: 1.25rem;
  }
  .peca img { width: 100%; height: auto; border-radius: 6px; margin-bottom: .75rem; }
  .marques { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .5rem; }
  .marca {
    font-family: system-ui, sans-serif; font-size: .72rem; text-transform: uppercase;
    letter-spacing: .04em; padding: .18rem .5rem; border-radius: 999px;
    background: #ecefe8; color: #3d5245;
  }
  .marca.b { background: #f6e7dc; color: #7a4b25; }
  .peca h2 { font-size: 1.2rem; margin: .2rem 0 .5rem; }
  .resum { margin: 0 0 .75rem; }
  .cos p { margin: 0 0 .6rem; font-size: .95rem; }
  .font { font-family: system-ui, sans-serif; font-size: .85rem; color: #5a5a5a; margin: .75rem 0; word-break: break-word; }
  .botons { display: flex; gap: .6rem; flex-wrap: wrap; }
  button {
    font-family: system-ui, sans-serif; font-size: 1rem; font-weight: 600;
    padding: .7rem 1.3rem; border-radius: 8px; border: 0; cursor: pointer;
    flex: 1 1 8rem; min-height: 2.9rem;
  }
  .publica { background: #146356; color: #fff; }
  .descarta { background: #efe9e2; color: #6a2b1f; }
  .buit { background: #fff; border: 1px solid #e2ddd2; border-radius: 10px; padding: 2rem 1rem; text-align: center; }
  .cua {
    font-family: system-ui, sans-serif; font-size: .9rem;
    background: #ecefe8; color: #3d5245; border-radius: 8px;
    padding: .6rem .8rem; margin: 0 0 1.25rem;
  }
  .auto {
    background: #fff; border: 1px solid #e2ddd2; border-radius: 10px;
    padding: .8rem 1rem; margin-bottom: 1.25rem;
  }
  .auto summary {
    font-family: system-ui, sans-serif; font-size: .9rem; font-weight: 600;
    cursor: pointer; color: #3d5245;
  }
  .autoitem { border-top: 1px solid #eee7db; padding: .8rem 0 .4rem; }
  .autotitol { margin: 0 0 .2rem; font-size: 1rem; }
  .automotiu {
    font-family: system-ui, sans-serif; font-size: .8rem; color: #5a5a5a;
    margin: 0 0 .5rem;
  }
  .autoitem button { flex: 0 0 auto; font-size: .85rem; padding: .45rem .9rem; }
  .peca--repetida { border-left: 4px solid #c9a227; }
  .repetida {
    font-family: system-ui, sans-serif; font-size: .85rem;
    color: #7a5c10; background: #fbf3d9; border-radius: 6px;
    padding: .5rem .7rem; margin: 0 0 .75rem;
  }
  label { display: block; font-family: system-ui, sans-serif; margin-bottom: .5rem; }
  input[type=password] {
    width: 100%; padding: .7rem; font-size: 1rem; border-radius: 8px;
    border: 1px solid #cfc7b8; margin-bottom: .75rem;
  }
  .error { color: #8a2b1f; font-family: system-ui, sans-serif; font-size: .9rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #16181a; color: #e8e4dc; }
    .peca, .buit { background: #1f2225; border-color: #33383c; }
    .compte, .font { color: #a5a29b; }
    .marca { background: #26332c; color: #b8ccbe; }
    .marca.b { background: #35291f; color: #d8b48d; }
    .cua { background: #26332c; color: #b8ccbe; }
    .repetida { background: #33301f; color: #e2ce8f; }
    .auto { background: #1f2225; border-color: #33383c; }
    .auto summary { color: #b8ccbe; }
    .autoitem { border-color: #2b3033; }
    .automotiu { color: #a5a29b; }
    input[type=password] { background: #14171a; color: #e8e4dc; border-color: #3a4046; }
    .descarta { background: #33292a; color: #e6b3a6; }
  }
`

function page(title, inner) {
  return `<!doctype html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
${inner}
</body>
</html>`
}

function htmlResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'x-robots-tag': 'noindex, nofollow',
      ...headers,
    },
  })
}

function loginPage({ error = '' } = {}) {
  return page(
    'Sala de revisió',
    `<h1>Sala de revisió</h1>
<p class="compte">El Bon Diari</p>
<form method="post" action="/revisio">
  <label for="c">Contrasenya</label>
  <input id="c" name="contrasenya" type="password" autocomplete="current-password" required>
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
  <button class="publica" type="submit">Entra</button>
</form>`,
  )
}

function storyCard(story, relacionadaAmb = null) {
  const circuit = story.circuit || story.sourceCircuit || ''
  const cos = Array.isArray(story.body) ? story.body : []
  const marques = [
    story.topic ? `<span class="marca">${escapeHtml(story.topic)}</span>` : '',
    story.category && story.category !== story.topic
      ? `<span class="marca">${escapeHtml(story.category)}</span>`
      : '',
    circuit
      ? `<span class="marca ${circuit === 'B' ? 'b' : ''}">Circuit ${escapeHtml(circuit)}</span>`
      : '',
  ]
    .filter(Boolean)
    .join('')
  // No s'amaga cap peça per semblar repetida: s'avisa, es diu AMB QUINA i
  // s'ensenyen juntes. Decideix qui llegeix.
  const avisRepetida = relacionadaAmb
    ? `<p class="repetida">Sembla que explica el mateix fet que <strong>${escapeHtml(
        relacionadaAmb.title,
      )}</strong>${
        relacionadaAmb.source ? ` (${escapeHtml(relacionadaAmb.source)})` : ''
      }, just aquí sobre. Mira-les totes dues abans de decidir.</p>`
    : ''
  return `<article class="peca${relacionadaAmb ? ' peca--repetida' : ''}">
  ${avisRepetida}
  ${story.imageUrl ? `<img src="${escapeHtml(story.imageUrl)}" alt="${escapeHtml(story.imageAlt || '')}">` : ''}
  <div class="marques">${marques}</div>
  <h2>${escapeHtml(story.title)}</h2>
  ${story.summary ? `<p class="resum">${escapeHtml(story.summary)}</p>` : ''}
  <div class="cos">${cos.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}</div>
  <p class="font">Font: ${escapeHtml(story.source || 'sense font')} · <a href="${escapeHtml(story.url || '#')}" target="_blank" rel="noopener noreferrer nofollow">obre l'original</a>${story.imageCredit ? `<br>Imatge: ${escapeHtml(story.imageCredit)}` : ''}</p>
  <form method="post" action="/revisio/decidir" class="botons">
    <input type="hidden" name="id" value="${escapeHtml(story.id)}">
    <!-- "Aprova" i no "Publica": aprovar registra la decisió; qui publica és
         el radar, a la pròxima passada. El botó ha de dir el que fa. -->
    <button class="publica" type="submit" name="decisio" value="approve">Aprova</button>
    <button class="descarta" type="submit" name="decisio" value="reject">Descarta</button>
  </form>
</article>`
}

async function listPage(env, { missatge = '' } = {}) {
  const [pending, esperantSortir, decididesSoles] = await Promise.all([
    listPendingCandidates(env),
    countPendingLive(env),
    listAssistantDecisions(env),
  ])
  const compte =
    pending.length === 0
      ? 'Res per revisar. El diari està al dia.'
      : pending.length === 1
      ? '1 peça espera que la llegeixis.'
      : `${pending.length} peces esperen que les llegeixis.`
  // Rastre PERMANENT del que s'ha aprovat i encara no ha sortit. Sense això,
  // qui revisa aprova una peça, no la veu al diari i no sap si s'ha perdut.
  const enCua =
    esperantSortir === 0
      ? ''
      : `<p class="cua">${
          esperantSortir === 1
            ? '1 peça aprovada espera sortir al web'
            : `${esperantSortir} peces aprovades esperen sortir al web`
        } · surten a la pròxima passada del radar</p>`
  // L'AGRUPACIÓ ES CALCULA AQUÍ, en llegir.
  //
  // Fer-ho només en inserir deixava fora les peces que ja eren a la base de
  // dades (l'INSERT OR IGNORE no actualitza res del que ja hi ha), i les tres
  // peces del mateix eclipsi que ja hi havia no s'haurien ajuntat mai.
  // Calculant-ho en llegir, la sala sempre ensenya els grups al dia i no cal
  // recuperar res enrere.
  const agrupades = agrupaPerEsdeveniment(pending, { idDe: (s) => s.id })
  const perId = new Map(pending.map((s) => [s.id, s]))
  const seguidores = new Map()
  for (const s of agrupades) {
    if (!s.possibleDuplicateOf) continue
    const llista = seguidores.get(s.possibleDuplicateOf) || []
    llista.push(s)
    seguidores.set(s.possibleDuplicateOf, llista)
  }
  // La representant primer i les relacionades tot seguit, perquè es puguin
  // comparar sense buscar-les per la pàgina.
  const ordenades = []
  const dibuixades = new Set()
  for (const s of agrupades) {
    if (s.possibleDuplicateOf) continue
    ordenades.push([s, null])
    dibuixades.add(s.id)
    for (const seguidora of seguidores.get(s.id) || []) {
      ordenades.push([seguidora, perId.get(s.id) || s])
      dibuixades.add(seguidora.id)
    }
  }
  // XARXA DE SEGURETAT: cada pendent ha de sortir EXACTAMENT una vegada.
  //
  // Si per qualsevol motiu una peça queda apuntant a una representant que no
  // és a la llista, ha de sortir igualment —sola i sense avís— en lloc de
  // desaparèixer. Cap camí d'aquesta pàgina no pot amagar una peça pendent.
  for (const s of agrupades) {
    if (dibuixades.has(s.id)) continue
    ordenades.push([s, null])
    dibuixades.add(s.id)
  }
  const cos =
    pending.length === 0
      ? '<div class="buit"><p>Cap peça pendent.</p></div>'
      : ordenades.map(([s, relacionada]) => storyCard(s, relacionada)).join('')
  // EL QUE HA DECIDIT L'AJUDANT, sempre a la vista i sempre reversible.
  //
  // Si la màquina publica sola, el mínim és poder mirar-li les mans: què ha
  // deixat passar, què ha descartat i amb quin motiu. I esmenar-ho amb un clic.
  const publicadesSoles = decididesSoles.filter((s) => s.autoDecision === 'approve')
  const descartadesSoles = decididesSoles.filter((s) => s.autoDecision !== 'approve')
  const seccioAuto = (llista, titol, accio, etiquetaAccio) =>
    llista.length === 0
      ? ''
      : `<details class="auto"><summary>${escapeHtml(titol)} (${llista.length})</summary>
${llista
  .map(
    (s) => `<div class="autoitem">
  <p class="autotitol">${escapeHtml(s.title)}</p>
  <p class="automotiu">${escapeHtml(s.source || '')}${s.autoReason ? ` · ${escapeHtml(s.autoReason)}` : ''}</p>
  <form method="post" action="/revisio/decidir">
    <input type="hidden" name="id" value="${escapeHtml(s.id)}">
    <button class="${accio === 'reject' ? 'descarta' : 'publica'}" type="submit" name="decisio" value="${accio}">${escapeHtml(etiquetaAccio)}</button>
  </form>
</div>`,
  )
  .join('')}
</details>`

  return page(
    'Sala de revisió',
    `<h1>Sala de revisió</h1>
<p class="compte">${escapeHtml(compte)}${missatge ? ` · ${escapeHtml(missatge)}` : ''}</p>
${enCua}
${seccioAuto(publicadesSoles, "L'ajudant ha publicat sol", 'reject', 'Retira-la del diari')}
${seccioAuto(descartadesSoles, "L'ajudant ha descartat sol", 'approve', 'Publica-la igualment')}
${cos}`,
  )
}

function seeOther(location) {
  return new Response(null, {
    status: 303,
    headers: { location, 'cache-control': 'no-store' },
  })
}

/**
 * Ruta única de la sala de revisió. Retorna null si el camí no li pertoca,
 * perquè el worker segueixi el seu curs normal.
 */
export async function handleReviewRoutes(request, env) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (path !== '/revisio' && path !== '/revisio/decidir') return null

  // Sense contrasenya configurada, la sala no existeix. Val més un 404 net que
  // una porta oberta perquè algú s'ha oblidat de posar-hi el secret.
  if (!reviewSecret(env)) {
    return htmlResponse(page('No disponible', '<p>Aquesta pàgina no existeix.</p>'), {
      status: 404,
    })
  }

  const authorized = await isReviewer(request, env)

  if (path === '/revisio' && request.method === 'POST' && !authorized) {
    const form = await request.formData()
    const provided = String(form.get('contrasenya') || '')
    if (!timingSafeEqual(provided, reviewSecret(env))) {
      return htmlResponse(loginPage({ error: 'Contrasenya incorrecta.' }), {
        status: 401,
      })
    }
    const cookie = [
      `${COOKIE_NAME}=${await sessionValue(reviewSecret(env))}`,
      'Path=/revisio',
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    ].join('; ')
    return new Response(null, {
      status: 303,
      headers: { location: '/revisio', 'set-cookie': cookie, 'cache-control': 'no-store' },
    })
  }

  if (!authorized) {
    return htmlResponse(loginPage(), { status: path === '/revisio' ? 200 : 401 })
  }

  if (path === '/revisio/decidir') {
    if (request.method !== 'POST') return seeOther('/revisio')
    const form = await request.formData()
    const id = String(form.get('id') || '')
    const decisio = String(form.get('decisio') || '')
    const outcome = await decideCandidate(env, id, decisio)
    // El missatge ha de dir la veritat. Abans deia "Publicada" encara que la
    // peça no hagués arribat al web, i qui revisava es quedava convençut
    // d'haver publicat una cosa que no hi era.
    const missatge = outcome.ok
      ? decisio === 'approve'
        ? 'Aprovada. Sortirà al web a la pròxima passada del radar.'
        : 'Descartada.'
      : outcome.error === 'not-pending'
      ? 'Aquesta peça ja estava decidida.'
      : outcome.error === 'not-published'
      ? 'No s’ha pogut publicar: la peça segueix aquí. Torna-ho a provar.'
      : 'No s’ha pogut desar la decisió.'
    return htmlResponse(await listPage(env, { missatge }))
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return seeOther('/revisio')
  }

  // Cada visita és una bona ocasió per treure les que ja han caducat.
  await expireStaleCandidates(env)
  return htmlResponse(await listPage(env))
}

export { countPendingCandidates }
