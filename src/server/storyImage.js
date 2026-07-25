// Il·lustracions editorials generades per IA (Workers AI) per a cada peça del
// radar. Substitueixen les fotos de premsa de tercers per evitar el risc de
// drets d'autor: cada notícia té una il·lustració ORIGINAL, propietat del Bon
// Diari, en un estil de casa constant i CLARAMENT no-fotogràfic (mai sembla una
// foto real d'un fet real, cosa impròpia d'un diari). Es genera un sol cop per
// peça i es cacheja al KV; les visites següents la serveixen del cache.
//
// Flux: el front demana `/api/story-image/<id>?s=<brief>&c=<categoria>&t=<titol>`.
// `s` és el brief visual per a la IA; `c` i `t` només els fa servir la targeta
// de reserva per compondre una portada pròpia de la peça. La ruta:
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
  // Cas preferit: el seed és una ESCENA concreta per a la notícia (sense "|"),
  // generada per la IA a partir del titular. La fem servir tal qual (dibuix
  // relacionat amb la peça). Cas llegat: "categoria|títol" → motiu de secció.
  let scene
  let variantKey
  if (clean.includes('|')) {
    const [category = '', title = ''] = clean.split('|')
    scene = CATEGORY_MOTIFS[normalizeKey(category)] || CATEGORY_MOTIFS.default
    variantKey = title || category
  } else {
    scene = clean || CATEGORY_MOTIFS.default
    variantKey = clean
  }
  const variant = COMPOSITION_VARIANTS[seedHash(variantKey) % COMPOSITION_VARIANTS.length]
  return [
    `Warm minimalist editorial illustration of ${scene}; ${variant}.`,
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

// ---------------------------------------------------------------------------
// TARGETA DE RESERVA
// ---------------------------------------------------------------------------
// Quan la IA no respon (o s'ha arribat al sostre diari) la peça no es pot quedar
// amb un genèric repetit: 19 targetes idèntiques a la portada semblen un error.
// Component una PORTADA EDITORIAL pròpia per notícia: verd de marca de fons,
// color Mondrian de la secció i el titular compost. Cada peça surt diferent
// perquè hi entren el titular, la categoria i un motiu geomètric determinista.
// Sempre és una imatge nostra: cap risc de drets.

// Mateixa paleta Mondrian que les seccions del web (vegeu App.css).
const SECTION_COLORS = {
  politica: ['#E72A30', '#FFFFFF'],
  esports: ['#E72A30', '#FFFFFF'],
  esport: ['#E72A30', '#FFFFFF'],
  solidaritat: ['#E72A30', '#FFFFFF'],
  opinio: ['#E72A30', '#FFFFFF'],
  societat: ['#1E50A0', '#FFFFFF'],
  mon: ['#1E50A0', '#FFFFFF'],
  'mon digital': ['#1E50A0', '#FFFFFF'],
  internacional: ['#1E50A0', '#FFFFFF'],
  educacio: ['#1E50A0', '#FFFFFF'],
  tecnologia: ['#1E50A0', '#FFFFFF'],
  europa: ['#1E50A0', '#FFFFFF'],
  dades: ['#1E50A0', '#FFFFFF'],
  cultura: ['#FFE000', '#111111'],
  salut: ['#FFE000', '#111111'],
  'medi ambient': ['#FFE000', '#111111'],
  ciencia: ['#FFE000', '#111111'],
  agenda: ['#FFE000', '#111111'],
  economia: ['#FFE000', '#111111'],
  oportunitats: ['#FFE000', '#111111'],
  default: ['#F4F1EA', '#111111'],
}

const BRAND_GREEN = '#146356'
const BRAND_GREEN_DEEP = '#0d443b'

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// L'SVG no sap fer salts de línia sols: partim el titular per paraules amb una
// amplada de caràcter estimada (Georgia ronda els 0,52 em de mitjana).
export function wrapTitle(title, fontSize, maxWidth, maxLines) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * 0.52)))
  const lines = []
  let current = ''
  // Una paraula més llarga que la línia (URL, mot compost) es parteix a pèl:
  // si no, sortiria del marc de la portada.
  const safeWords = []
  for (const word of words) {
    if (word.length <= maxChars) safeWords.push(word)
    else for (let i = 0; i < word.length; i += maxChars) safeWords.push(word.slice(i, i + maxChars))
  }
  for (const word of safeWords) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
    if (lines.length === maxLines) break
  }
  if (current && lines.length < maxLines) lines.push(current)
  if (lines.length === maxLines) {
    const consumed = lines.join(' ').split(/\s+/).length
    if (consumed < safeWords.length) {
      const last = lines[maxLines - 1]
      lines[maxLines - 1] = `${last.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
    }
  }
  return lines
}

// Motiu geomètric determinista: quatre composicions Mondrian discretes, triades
// pel hash del titular. Dona varietat sense treure protagonisme al text.
// Tots els motius viuen a la franja dreta (x ≥ 836) i per sobre del peu
// (y ≤ 600): la columna de text i la signatura han de quedar sempre netes.
function motifSvg(variant, accent) {
  const shapes = [
    `<rect x="836" y="0" width="188" height="210" fill="${accent}" opacity="0.9"/>
     <rect x="836" y="210" width="188" height="12" fill="#FFFFFF" opacity="0.25"/>`,
    `<rect x="836" y="150" width="188" height="240" fill="${accent}" opacity="0.85"/>
     <rect x="836" y="404" width="188" height="12" fill="#FFFFFF" opacity="0.25"/>`,
    `<circle cx="930" cy="196" r="74" fill="none" stroke="#FFFFFF" stroke-width="12" opacity="0.3"/>
     <rect x="836" y="336" width="188" height="140" fill="${accent}" opacity="0.85"/>`,
    `<rect x="836" y="64" width="188" height="164" fill="${accent}" opacity="0.85"/>
     <rect x="836" y="252" width="188" height="72" fill="#FFFFFF" opacity="0.16"/>`,
  ]
  return shapes[variant % shapes.length]
}

export function fallbackSvg({ seed, category, title }) {
  const clean = sanitizeSeed(seed)
  // Categoria: del paràmetre `c`, o del seed llegat "categoria|títol".
  const rawCategory = category || (clean.includes('|') ? clean.split('|')[0] : '')
  const label = (rawCategory || 'Bona notícia').trim()
  const [accent, accentInk] = SECTION_COLORS[normalizeKey(label)] || SECTION_COLORS.default

  // Titular: del paràmetre `t`, o del seed llegat. El brief en anglès de la IA
  // no s'imprimeix mai (descriu una escena, no la notícia).
  const rawTitle = title || (clean.includes('|') ? clean.split('|')[1] : '')
  const headline = sanitizeSeed(rawTitle)

  // 720 px d'amplada de text: deixa lliure la franja dreta on van els motius.
  const fontSize = headline.length <= 58 ? 62 : headline.length <= 104 ? 52 : 44
  const lines = wrapTitle(headline, fontSize, 720, 4)
  const lineHeight = Math.round(fontSize * 1.22)
  // Bloc de text centrat verticalment dins la franja lliure de la portada.
  const blockTop = 300 - ((lines.length - 1) * lineHeight) / 2
  const variant = seedHash(headline || clean || label) % 4
  // L'etiqueta es dibuixa amb textLength: les lletres s'ajusten EXACTAMENT a
  // l'ample de la pastilla, així no se surt encara que el renderitzador no
  // tingui la mateixa tipografia i calculi amplades diferents.
  const pillWidth = Math.min(680, 44 + label.length * 24)

  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="88" y="${blockTop + index * lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('\n    ')

  const titleTag = escapeXml(headline || label)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768" role="img" aria-label="${titleTag}">
  <title>${titleTag}</title>
  <defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="${BRAND_GREEN}"/><stop offset="1" stop-color="${BRAND_GREEN_DEEP}"/>
  </linearGradient></defs>
  <rect width="1024" height="768" fill="url(#g)"/>
  ${motifSvg(variant, accent)}
  <rect x="88" y="104" width="${pillWidth}" height="52" fill="${accent}"/>
  <text x="110" y="140" font-family="Helvetica, Arial, sans-serif" font-size="25" font-weight="bold" letter-spacing="2.5" fill="${accentInk}" textLength="${pillWidth - 44}" lengthAdjust="spacingAndGlyphs">${escapeXml(label.toUpperCase())}</text>
  ${
    lines.length
      ? `<text font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" fill="#FFFFFF">
    ${tspans}
  </text>`
      : ''
  }
  <rect x="88" y="656" width="848" height="3" fill="#FFFFFF" opacity="0.4"/>
  <text x="88" y="712" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="#FFFFFF">El Bon Diari</text>
  <text x="936" y="712" font-family="Helvetica, Arial, sans-serif" font-size="19" letter-spacing="1.5" fill="#FFFFFF" opacity="0.75" text-anchor="end">bondiari.com</text>
</svg>`
}

const OK_HEADERS = {
  'content-type': 'image/jpeg',
  'cache-control': 'public, max-age=31536000, immutable',
}

function svgResponse(parts, status = 200) {
  return new Response(fallbackSvg(parts), {
    status,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Reserva: cache curt, perquè quan la IA torni es generi la definitiva.
      'cache-control': 'public, max-age=600',
    },
  })
}

function dailyCapKey() {
  return `imggen:${new Date().toISOString().slice(0, 10)}`
}

async function underDailyCap(env) {
  const current = parseInt((await env.LIVE_NEWS_KV.get(dailyCapKey())) || '0', 10)
  return current < DAILY_GENERATION_CAP
}

// El comptador només puja quan la IA ha lliurat una imatge de debò. Abans es
// comptava en el moment de DEMANAR-LA, així que cada intent fallit (i cada
// visita els repeteix, perquè els errors no es cachegen) cremava quota: n'hi
// havia prou amb una estona d'errors per esgotar el sostre del dia i deixar tot
// el diari servint la targeta de reserva fins l'endemà.
function bumpDailyCount(env, ctx) {
  const task = (async () => {
    const key = dailyCapKey()
    const current = parseInt((await env.LIVE_NEWS_KV.get(key)) || '0', 10)
    await env.LIVE_NEWS_KV.put(key, String(current + 1), { expirationTtl: 3 * 24 * 3600 })
  })()
  if (ctx?.waitUntil) ctx.waitUntil(task)
  return task
}

export async function handleStoryImage(request, env, ctx) {
  const url = new URL(request.url)
  const id = url.pathname.replace('/api/story-image/', '').replace(/\/+$/, '')
  const seed = url.searchParams.get('s') || ''
  // Categoria i titular per a la targeta de reserva (la IA no els fa servir).
  const parts = {
    seed,
    category: url.searchParams.get('c') || '',
    title: url.searchParams.get('t') || '',
  }

  // L'id ha de tenir la forma d'un id de peça del radar (feed-xxxx). Evita que
  // es puguin demanar generacions per a ids inventats.
  if (!/^feed-[0-9a-z]+$/.test(id)) return svgResponse(parts, 404)

  const key = KV_PREFIX + id

  // 1) Cache
  const cached = await env.LIVE_NEWS_KV.get(key, { type: 'arrayBuffer' })
  if (cached) return new Response(cached, { headers: OK_HEADERS })

  // Falta el binding d'IA o s'ha superat el sostre → reserva.
  if (!env.AI || !(await underDailyCap(env))) return svgResponse(parts)

  // 2) Generació (un sol cop per peça)
  try {
    const out = await env.AI.run(IMAGE_MODEL, { prompt: buildPrompt(seed), steps: 6 })
    const b64 = out?.image
    if (!b64) throw new Error('resposta sense imatge')
    const bytes = base64ToBytes(b64)
    const put = env.LIVE_NEWS_KV.put(key, bytes, { expirationTtl: CACHE_TTL_SECONDS })
    if (ctx?.waitUntil) ctx.waitUntil(put)
    else await put
    bumpDailyCount(env, ctx)
    return new Response(bytes, { headers: OK_HEADERS })
  } catch (error) {
    console.error('[story-image]', error?.message || error)
    return svgResponse(parts)
  }
}
