import { getStore } from '@netlify/blobs'

export const refreshIntervalMs = 4 * 60 * 60 * 1000

const cacheKey = 'latest'
const storeName = 'bon-diari-live-news'
const maxLiveStoryAgeMs = 60 * 24 * 60 * 60 * 1000
const liveEditorialVersion = 4

const sections = [
  {
    url: 'https://www.3cat.cat/3catinfo/politica/',
    category: 'Política',
  },
  {
    url: 'https://www.3cat.cat/3catinfo/societat/',
    category: 'Societat',
  },
  {
    url: 'https://www.3cat.cat/3catinfo/cultura/',
    category: 'Cultura',
  },
  {
    url: 'https://www.3cat.cat/3catinfo/esports/',
    category: 'Esports',
  },
  {
    url: 'https://www.3cat.cat/3catinfo/salut/',
    category: 'Salut',
  },
  {
    url: 'https://www.3cat.cat/3catinfo/medi-ambient/',
    category: 'Medi ambient',
  },
  {
    url: 'https://www.3cat.cat/3catinfo/ciencia-i-tecnologia/',
    category: 'Món digital',
  },
]

const positiveStems = [
  'èxit',
  'recupera',
  'aconsegueix',
  'ajuda',
  'ajudi',
  'solidaritat',
  'millora',
  'estrena',
  'guanya',
  'creix',
  'pioner',
  'avança',
  'acollida',
  'renaixement',
  'ajut',
  'donació',
  'salva',
  'premi',
  'protecció',
  'restaura',
  'rehabilita',
  'gratuït',
  'inclusió',
  'referent',
  'voluntari',
]

const negativeStems = [
  'abus',
  'acusaci',
  'assassinat',
  'addicci',
  'alerta',
  'avís',
  'budells',
  'cau',
  'càncer',
  'clandest',
  'confinament',
  'contaminaci',
  'corrup',
  'crítica',
  'desnonament',
  'detenen',
  'detingut',
  'denuncia',
  'denunci',
  'destru',
  'derrota',
  'descens',
  'exhum',
  'escàndol',
  'fracàs',
  'fracas',
  'fuita',
  'greu',
  'guitza',
  'guerra',
  'explota',
  'emergència',
  'falta ',
  'falten',
  'incendi',
  'investiguen',
  'jutjat',
  'l’altra cara',
  "l'altra cara",
  'llistes d’espera',
  "llistes d'espera",
  'mala gestió',
  'massificaci',
  'mort',
  'mor ',
  'mosquit',
  'panerola',
  'oposició',
  'patir',
  'perill',
  'pelotazo',
  'pelotazos',
  'perdem el control',
  'problema mèdic',
  'prohibeix',
  'recular',
  'rebuig',
  'residual',
  'residu',
  'pesta',
  'presó',
  'robatori',
  'risc',
  'sospitos',
  'suspens',
  'tremol',
  'vampir',
  'víctima',
  'vaga',
  'violència',
]

function asArray(value) {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function getImageUrl(item) {
  return (
    asArray(item.imatges).find((image) => image?.text)?.text?.trim() ||
    item.thumbnail ||
    ''
  )
}

function getStoryUrl(item) {
  if (item.url) {
    return item.url.startsWith('http')
      ? item.url
      : `https://www.3cat.cat${item.url}`
  }

  const slug = slugify(item.permatitle || item.titol)

  if (!slug || !item.id) {
    return ''
  }

  return `https://www.3cat.cat/3catinfo/${slug}/noticia/${item.id}/`
}

function detectLocation(text) {
  if (text.includes('mataró') || text.includes('maresme')) {
    return 'Mataró, Maresme'
  }

  if (text.includes('barcelona') || text.includes('bcn')) {
    return 'Barcelona, Catalunya'
  }

  if (text.includes('girona')) {
    return 'Girona, Catalunya'
  }

  if (text.includes('lleida')) {
    return 'Lleida, Catalunya'
  }

  if (text.includes('tarragona')) {
    return 'Tarragona, Catalunya'
  }

  if (text.includes('reus')) {
    return 'Reus, Catalunya'
  }

  if (text.includes('catalunya') || text.includes('català')) {
    return 'Catalunya'
  }

  return 'Catalunya'
}

function parseCatalanDate(value) {
  const match = String(value || '').match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/,
  )

  if (!match) {
    return ''
  }

  const [, day, month, year, hour, minute, second = '00'] = match
  return new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}+02:00`,
  ).toISOString()
}

function extractNextData(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  )

  if (!match) {
    return null
  }

  return JSON.parse(match[1])
}

function collectThemeItems(value, results = []) {
  if (!value || typeof value !== 'object') {
    return results
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectThemeItems(item, results)
    }

    return results
  }

  if (value.id && value.titol && value.entradeta && getImageUrl(value)) {
    results.push(value)
  }

  for (const child of Object.values(value)) {
    collectThemeItems(child, results)
  }

  return results
}

function normalizeStory(item, section) {
  const title = stripHtml(item.titol || item.permatitle)
  const description = stripHtml(item.entradeta || title)
  const link = getStoryUrl(item)
  const imageUrl = getImageUrl(item)
  const publishedAt = parseCatalanDate(
    item.data_publicacio || item.data_modificacio,
  )
  const fullText = `${title} ${description}`.toLowerCase()
  const isNegative = negativeStems.some((word) => fullText.includes(word))
  const isPositive = positiveStems.some((word) => fullText.includes(word))

  if (!title || !link || !imageUrl || !publishedAt || isNegative || !isPositive) {
    return null
  }

  return {
    title,
    category: section.category,
    location: detectLocation(fullText),
    summary: `${description.slice(0, 180)}${description.length > 180 ? '...' : ''}`,
    impact:
      'El radar automàtic l’ha detectada com a notícia constructiva de proximitat.',
    source: '3CatInfo',
    url: link,
    imageUrl,
    imageAlt: `Imatge de portada per a ${title}.`,
    imageCredit: '3CatInfo',
    imageAttributionUrl: link,
    editorialScore: isPositive ? 1 : 0,
    editorialVersion: liveEditorialVersion,
    publishedAt,
  }
}

async function collectSectionStories(section) {
  const response = await fetch(section.url, {
    headers: {
      accept: 'text/html',
      'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
    },
  })

  if (!response.ok) {
    return []
  }

  const html = await response.text()
  const nextData = extractNextData(html)
  const pageProps = nextData?.props?.pageProps

  if (!pageProps) {
    return []
  }

  return collectThemeItems(pageProps)
    .map((item) => normalizeStory(item, section))
    .filter(Boolean)
}

export async function collectLivePositiveNews() {
  const stories = []

  for (const section of sections) {
    const sectionStories = await collectSectionStories(section)
    stories.push(...sectionStories)
  }

  const uniqueStories = new Map()

  for (const story of stories) {
    if (!uniqueStories.has(story.url)) {
      uniqueStories.set(story.url, story)
    }
  }

  return [...uniqueStories.values()]
    .filter(
      (story) =>
        Date.now() - new Date(story.publishedAt).getTime() <= maxLiveStoryAgeMs,
    )
    .sort(
      (left, right) =>
        right.editorialScore - left.editorialScore ||
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime(),
    )
    .map((story) => {
      const publicStory = { ...story }
      delete publicStory.editorialScore
      return publicStory
    })
    .slice(0, 12)
}

async function getCachedPayload() {
  const store = getStore({ name: storeName })
  return store.get(cacheKey, { type: 'json' })
}

async function setCachedPayload(stories) {
  const updatedAt = new Date().toISOString()
  const payload = {
    updatedAt,
    nextRefreshAt: new Date(Date.now() + refreshIntervalMs).toISOString(),
    stories,
  }
  const store = getStore({ name: storeName })
  await store.setJSON(cacheKey, payload)
  return payload
}

export async function getLiveNewsPayload({ force = false } = {}) {
  let cached = null

  try {
    cached = await getCachedPayload()
  } catch (error) {
    console.warn('No s’ha pogut llegir la memòria de notícies', error)
  }

  if (!force) {
    const updatedAt = cached?.updatedAt ? new Date(cached.updatedAt).getTime() : 0
    const isFresh = updatedAt && Date.now() - updatedAt < refreshIntervalMs

    if (cached?.stories && isFresh) {
      return { ...cached, cache: 'hit' }
    }
  }

  const stories = await collectLivePositiveNews()

  if (stories.length === 0 && cached?.stories?.length) {
    return { ...cached, cache: 'stale' }
  }

  try {
    const payload = await setCachedPayload(stories)
    return { ...payload, cache: 'refresh' }
  } catch (error) {
    console.warn('No s’ha pogut escriure la memòria de notícies', error)

    const updatedAt = new Date().toISOString()
    return {
      updatedAt,
      nextRefreshAt: new Date(Date.now() + refreshIntervalMs).toISOString(),
      stories,
      cache: 'transient',
    }
  }
}
