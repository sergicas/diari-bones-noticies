const refreshIntervalMs = 12 * 60 * 60 * 1000
const maxLiveStoryAgeMs = 60 * 24 * 60 * 60 * 1000
const liveEditorialVersion = 3

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
  'exhum',
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
    .replace(/<\/?[^>]+(>|$)/g, ' ')
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

function detectLocation(fullText) {
  if (fullText.includes('mataró') || fullText.includes('maresme')) {
    return 'Mataró, Maresme'
  }

  if (fullText.includes('barcelona') || fullText.includes('bcn')) {
    return 'Barcelona, Catalunya'
  }

  if (fullText.includes('girona')) {
    return 'Girona, Catalunya'
  }

  if (fullText.includes('lleida')) {
    return 'Lleida, Catalunya'
  }

  if (fullText.includes('tarragona')) {
    return 'Tarragona, Catalunya'
  }

  if (fullText.includes('reus')) {
    return 'Reus, Catalunya'
  }

  if (fullText.includes('catalunya') || fullText.includes('català')) {
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
    summary: `${description.slice(0, 180)}${
      description.length > 180 ? '...' : ''
    }`,
    impact: 'El radar l’ha detectada com a notícia constructiva de proximitat.',
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

function sortByPublishedAt(left, right) {
  return (
    new Date(right.publishedAt).getTime() -
    new Date(left.publishedAt).getTime()
  )
}

async function fetchNetlifyPayload({ force = false } = {}) {
  const params = new URLSearchParams({ v: String(liveEditorialVersion) })

  if (force) {
    params.set('force', '1')
  }

  const endpoint = `/api/live-news?${params.toString()}`
  const response = await fetch(endpoint, {
    headers: {
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`El radar publicat ha retornat ${response.status}`)
  }

  const payload = await response.json()

  if (!Array.isArray(payload.stories)) {
    throw new Error('El radar publicat no ha retornat una llista de notícies.')
  }

  return {
    ...payload,
    stories: payload.stories.sort(sortByPublishedAt),
  }
}

async function fetchSectionHtml(sectionUrl) {
  try {
    const directResponse = await fetch(sectionUrl)

    if (directResponse.ok) {
      return directResponse.text()
    }
  } catch {
    // El navegador pot bloquejar 3Cat per CORS; provem el proxy de desenvolupament.
  }

  const proxyUrl = 'https://api.allorigins.win/get?url='
  const proxiedResponse = await fetch(proxyUrl + encodeURIComponent(sectionUrl))

  if (!proxiedResponse.ok) {
    throw new Error(`El proxy ha retornat ${proxiedResponse.status}`)
  }

  const data = await proxiedResponse.json()
  return data.contents || ''
}

async function fetchFallbackStories() {
  const stories = []

  for (const section of sections) {
    try {
      const html = await fetchSectionHtml(section.url)
      const nextData = extractNextData(html)
      const pageProps = nextData?.props?.pageProps

      if (!pageProps) {
        continue
      }

      const sectionStories = collectThemeItems(pageProps)
        .map((item) => normalizeStory(item, section))
        .filter(Boolean)

      stories.push(...sectionStories)
    } catch {
      console.warn('La secció ha fallat per', section.url)
    }
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
        sortByPublishedAt(left, right),
    )
    .map((story) => {
      const publicStory = { ...story }
      delete publicStory.editorialScore
      return publicStory
    })
    .slice(0, 12)
}

export async function fetchLivePositiveNewsPayload(options = {}) {
  try {
    return await fetchNetlifyPayload(options)
  } catch (error) {
    console.warn('El radar publicat no està disponible; fem servir el fallback local.', error)
  }

  const updatedAt = new Date().toISOString()

  return {
    cache: 'browser-fallback',
    nextRefreshAt: new Date(Date.now() + refreshIntervalMs).toISOString(),
    stories: await fetchFallbackStories(),
    updatedAt,
  }
}

export async function fetchLivePositiveNews(options = {}) {
  const payload = await fetchLivePositiveNewsPayload(options)
  return payload.stories
}
