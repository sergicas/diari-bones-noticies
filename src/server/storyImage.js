// Il·lustracions editorials generades per IA (Workers AI) per a cada peça del
// radar. Substitueixen les fotos de premsa de tercers per evitar el risc de
// drets d'autor: cada notícia té una il·lustració ORIGINAL, propietat del Bon
// Diari, en un estil de casa constant i CLARAMENT no-fotogràfic (mai sembla una
// foto real d'un fet real, cosa impròpia d'un diari). Es genera un sol cop per
// peça i es cacheja al KV; les visites següents la serveixen del cache.
//
// Flux: el front demana `/api/story-image/<id>?s=<categoria|titol>`. La ruta:
//   1) si la té al cache (KV `img:<id>`), la retorna.
//   2) si no, la genera amb la IA, la desa i la retorna.
//   3) si la IA falla o s'ha superat el límit diari, retorna una targeta de
//      reserva (SVG amb els colors de la marca).

const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell'
const KV_PREFIX = 'img:'
const CACHE_TTL_SECONDS = 90 * 24 * 3600 // les il·lustracions viuen 90 dies al cache
// Sostre de generacions noves al dia: xarxa de seguretat de cost. Una jornada
// normal en genera unes poques desenes (només les notícies noves).
const DAILY_GENERATION_CAP = 600

// La ruta que el front i els meta socials posen a cada peça viu a
// ../lib/story-image-path.js (funció pura, sense codi de servidor).

function sanitizeSeed(raw) {
  return String(raw || '')
    .replace(/[<>{}"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

// Motiu visual per categoria. NO fem servir mai el titular dins la imatge: els
// models petits (Flux) tendeixen a "escriure" el text que els passes, i sortia
// la paraula de la categoria retolada a la làmina. En lloc d'això, cada secció
// té una escena simbòlica pròpia, sempre sense text.
const CATEGORY_MOTIFS = {
  cultura: 'an open book, a theatre mask and musical notes in a warm library',
  economia: 'a green sprout growing from stacked coins, hands trading at a market stall',
  salut: 'a gentle caring hand, a leafy green cross, a calm sunrise over a clinic',
  educacio: 'an open notebook and a chalkboard, young people reading together',
  tecnologia: 'abstract circuit lines blooming into leaves, a friendly little robot',
  ciencia: 'a telescope under a starry sky, an atom drawn as orbiting leaves',
  'medi ambient': 'a growing tree, a clean river and wind turbines among soft hills, birds',
  clima: 'a leafy hillside, a clean river and wind turbines under a calm sky, birds',
  societat: 'diverse stylised people helping one another, hands joined in a circle',
  solidaritat: 'many open hands joining together, a shared meal and a warm helping gesture',
  comunitat: 'a welcoming neighbourhood square with people, trees and a fountain',
  'mon digital': 'abstract circuit lines blooming into leaves, gentle connected dots, a friendly screen',
  internacional: 'a gentle globe cradled by leaves, small birds circling',
  esports: 'a lone runner at sunrise, a bicycle and an open field',
  esport: 'a lone runner at sunrise, a bicycle and an open field',
  opinio: 'a quill resting on paper beside a warm cup, a thoughtful still life',
  politica: 'a simple ballot and an olive branch, a calm public square at dawn',
  actualitat: 'a serene stylised townscape at golden hour, rooftops and trees',
  mon: 'a gentle globe cradled by leaves, small birds circling',
  espanya: 'a warm Mediterranean landscape with terraces and olive trees',
  catalunya: 'soft Catalan hills with vineyards and a small village at golden hour',
  barcelona: 'a stylised Mediterranean rooftop skyline at golden hour, no landmarks',
  europa: 'gentle rolling hills and a quiet harbour under a warm sky',
  local: 'a small welcoming neighbourhood square with a fountain and trees',
  default: 'a hopeful sunrise over gentle hills, a small sprout and open hands',
}

// Variants de composició per donar varietat entre peces de la mateixa secció,
// deterministes segons el titular (mai text a la imatge).
const COMPOSITION_VARIANTS = [
  'centred symmetrical composition',
  'wide horizon with a low viewpoint',
  'a single small figure seen from behind',
  'close-up of gentle hands',
  'soft aerial overhead view',
  'framed by leaves and branches',
]

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

function seedHash(text) {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0
  return hash >>> 0
}

// Estil de casa: il·lustració editorial, mai una foto. Paleta Furoshiki v2
// (argila / terracota / paper / tinta) perquè totes les peces siguin família.
function buildPrompt(seed) {
  const clean = sanitizeSeed(seed)
  const [category = '', title = ''] = clean.split('|')
  const motif = CATEGORY_MOTIFS[normalizeKey(category)] || CATEGORY_MOTIFS.default
  const variant = COMPOSITION_VARIANTS[seedHash(title || category) % COMPOSITION_VARIANTS.length]
  return [
    `Warm minimalist editorial illustration of ${motif}; ${variant}.`,
    'Symbolic and hopeful, clearly a hand-drawn illustration and NOT a photograph.',
    'Textured paper grain and soft ink linework; muted earthy palette of clay, terracotta, cream and deep ink blue.',
    'Calm, dignified mood, gentle balanced composition, editorial poster aesthetic.',
    'Absolutely no text, no words, no letters, no captions, no titles, no logos, no watermarks, no signatures.',
    'No realistic faces of identifiable real people; any figures stay stylised and generic.',
  ].join(' ')
}

function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Targeta de reserva amb els colors de la marca, per si la IA no respon o s'ha
// arribat al sostre diari. Sempre és una imatge pròpia: cap risc legal.
function fallbackSvg(seed) {
  const [category = ''] = sanitizeSeed(seed).split('|')
  const label = (category || 'Bona notícia').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768" role="img">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#e7d5ba"/><stop offset="1" stop-color="#b47a55"/>
  </linearGradient></defs>
  <rect width="1024" height="768" fill="url(#g)"/>
  <circle cx="512" cy="300" r="118" fill="none" stroke="#3a2a1e" stroke-width="6" opacity="0.55"/>
  <text x="512" y="470" font-family="Georgia, 'Times New Roman', serif" font-size="46" fill="#3a2a1e" text-anchor="middle">El Bon Diari</text>
  <text x="512" y="524" font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="#5a4636" text-anchor="middle">${label}</text>
</svg>`
}

const OK_HEADERS = {
  'content-type': 'image/jpeg',
  'cache-control': 'public, max-age=31536000, immutable',
}

function svgResponse(seed, status = 200) {
  return new Response(fallbackSvg(seed), {
    status,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Reserva: cache curt, perquè quan la IA torni es generi la definitiva.
      'cache-control': 'public, max-age=600',
    },
  })
}

async function underDailyCap(env, ctx) {
  const day = new Date().toISOString().slice(0, 10)
  const key = `imggen:${day}`
  const current = parseInt((await env.LIVE_NEWS_KV.get(key)) || '0', 10)
  if (current >= DAILY_GENERATION_CAP) return false
  const bump = env.LIVE_NEWS_KV.put(key, String(current + 1), { expirationTtl: 3 * 24 * 3600 })
  if (ctx?.waitUntil) ctx.waitUntil(bump)
  else await bump
  return true
}

export async function handleStoryImage(request, env, ctx) {
  const url = new URL(request.url)
  const id = url.pathname.replace('/api/story-image/', '').replace(/\/+$/, '')
  const seed = url.searchParams.get('s') || ''

  // L'id ha de tenir la forma d'un id de peça del radar (feed-xxxx). Evita que
  // es puguin demanar generacions per a ids inventats.
  if (!/^feed-[0-9a-z]+$/.test(id)) return svgResponse(seed, 404)

  const key = KV_PREFIX + id

  // 1) Cache
  const cached = await env.LIVE_NEWS_KV.get(key, { type: 'arrayBuffer' })
  if (cached) return new Response(cached, { headers: OK_HEADERS })

  // Falta el binding d'IA o s'ha superat el sostre → reserva.
  if (!env.AI || !(await underDailyCap(env, ctx))) return svgResponse(seed)

  // 2) Generació (un sol cop per peça)
  try {
    const out = await env.AI.run(IMAGE_MODEL, { prompt: buildPrompt(seed), steps: 6 })
    const b64 = out?.image
    if (!b64) throw new Error('resposta sense imatge')
    const bytes = base64ToBytes(b64)
    const put = env.LIVE_NEWS_KV.put(key, bytes, { expirationTtl: CACHE_TTL_SECONDS })
    if (ctx?.waitUntil) ctx.waitUntil(put)
    else await put
    return new Response(bytes, { headers: OK_HEADERS })
  } catch (error) {
    console.error('[story-image]', error?.message || error)
    return svgResponse(seed)
  }
}
