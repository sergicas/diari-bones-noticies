import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import './App.css'
import { editorialValues, seedArticles } from './data/articles'
import { fetchLivePositiveNewsPayload } from './api/rssFeed'
import { LIVE_EDITORIAL_VERSION } from './lib/editorial-version.js'
import { feedStoryId } from './lib/story-id.js'
import NewsletterForm from './components/NewsletterForm.jsx'
import PushOptIn from './components/PushOptIn.jsx'
import EditorialCounter from './components/EditorialCounter.jsx'
import PageHero from './components/PageHero.jsx'
import ManifestSection from './components/ManifestSection.jsx'
import SourcesManifest from './components/SourcesManifest.jsx'
import NotFoundPage from './components/NotFoundPage.jsx'
import ShareRow from './components/ShareRow.jsx'
import SaveButton from './components/SaveButton.jsx'
import PullToRefresh from './components/PullToRefresh.jsx'
import { getSaved, removeSaved, SAVED_EVENT } from './lib/saved.js'
import {
  DEFAULT_STORY_IMAGE,
  classifyImage,
  hasOriginalPhoto,
} from './lib/imageRules'

const siteName = 'El Bon Diari'
const siteUrl = 'https://bondiari.com'
const defaultDescription =
  "El diari que només publica bones notícies verificables, útils i amb impacte real."
const refreshStorageKey = 'bon-diari-last-refresh-at-v4'
const nextRefreshStorageKey = 'bon-diari-next-refresh-at-v4'
const defaultStoryImage = DEFAULT_STORY_IMAGE
const currentLiveEditorialVersion = LIVE_EDITORIAL_VERSION
const autoRefreshIntervalMs = 1 * 60 * 60 * 1000
const activeEditionLimit = 40
// A la portada només hi ha les notícies de menys de 2 dies; les més velles
// passen automàticament a la Hemeroteca.
const activeEditionMaxAgeMs = 2 * 24 * 60 * 60 * 1000
// Terra de seguretat: la portada MAI no es buida. Si un dia no hi ha prou
// notícies fresques (< 2 dies), ensenyem igualment les més noves disponibles
// fins a aquest mínim, perquè el diari no quedi mai en blanc.
const activeEditionFloor = 12
const maxStoredFeedStories = 40
const minStoriesPerSection = 5

const dateFormatter = new Intl.DateTimeFormat('ca-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('ca-ES', {
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
  year: 'numeric',
})

const cataloniaKeywords = [
  'catalunya',
  'catalonia',
  'cataluña',
  'barcelona',
  'girona',
  'lleida',
  'tarragona',
  'mataró',
  'maresme',
  'sabadell',
  'terrassa',
  'reus',
  'vic',
  'manresa',
  'igualada',
  'sitges',
  'tortosa',
  'amposta',
  'badalona',
  'hospitalet',
  'llobregat',
  'empordà',
  'ebre',
  'garrotxa',
  'olot',
  'figueres',
  'vilafranca',
]

const spainKeywords = [
  'espanya',
  'españa',
  'spain',
  'madrid',
  'valència',
  'valencia',
  'sevilla',
  'saragossa',
  'zaragoza',
  'galicia',
  'andalusia',
  'andalucía',
  'navarra',
  'asturias',
  'castilla',
  'castella',
  'euskadi',
  'país basc',
  'pais basc',
  'bilbao',
  'oviedo',
  'alicante',
  'múrcia',
  'murcia',
  'palma',
  'mallorca',
  'menorca',
  'eivissa',
  'ibiza',
  'canàries',
  'canarias',
]

const europeKeywords = [
  'europa',
  'europe',
  'paris',
  'frança',
  'france',
  'alemanya',
  'germany',
  'italia',
  'italy',
  'portugal',
  'lisboa',
  'lisbon',
  'brussel·les',
  'brussels',
  'irlanda',
  'ireland',
]

const distanceBandConfig = [
  {
    id: 'catalunya',
    rank: 0,
    label: 'Catalunya',
    editorialLabel: 'A tocar',
    description:
      'Prioritat absoluta per a peces de Catalunya i del seu entorn immediat.',
  },
  {
    id: 'estat',
    rank: 1,
    label: "Resta de l'Estat",
    editorialLabel: 'A prop',
    description:
      "Quan no n'hi ha prou amb el radar local, ampliem a la resta de l'Estat.",
  },
  {
    id: 'europa',
    rank: 2,
    label: 'Europa',
    editorialLabel: 'Més enllà',
    description:
      'El ventall europeu entra quan aporta solucions replicables o context útil.',
  },
  {
    id: 'mon',
    rank: 3,
    label: 'Món',
    editorialLabel: 'Obertura global',
    description:
      'Només arribem aquí quan cal obrir la mirada cap a fora de manera progressiva.',
  },
]

const distanceFilterOptions = [
  {
    id: 'progressiu',
    label: 'Ventall progressiu',
    description: 'Catalunya, Estat, Europa i món en aquest ordre.',
    maxRank: 3,
  },
  {
    id: 'catalunya',
    label: 'Només Catalunya',
    description: 'Peces estrictament locals.',
    maxRank: 0,
  },
  {
    id: 'estat',
    label: "Fins a l'Estat",
    description: "Catalunya i resta de l'Estat.",
    maxRank: 1,
  },
  {
    id: 'europa',
    label: 'Fins a Europa',
    description: 'Catalunya, Estat i Europa.',
    maxRank: 2,
  },
  {
    id: 'mon',
    label: 'Tot el mapa',
    description: 'Sense límit geogràfic.',
    maxRank: 3,
  },
]

const editorialSections = [
  {
    id: 'local',
    label: 'Local',
    description:
      'Mataró i el Maresme: el que passa al costat de casa.',
    categories: ['Local'],
    keywords: ['mataró', 'maresme', 'argentona', 'arenys', 'premià', 'vilassar', 'cabrera de mar', 'masnou', 'canet de mar', 'calella', 'pineda de mar', 'malgrat de mar', 'tordera', 'llavaneres', 'alella', 'montgat'],
  },
  {
    id: 'politica',
    label: 'Política',
    description:
      'Institucions, drets i decisions públiques quan generen millores concretes.',
    categories: ['Política'],
    keywords: ['govern', 'generalitat', 'ajuntament', 'parlament', 'política'],
  },
  {
    id: 'societat',
    label: 'Societat',
    description:
      'Comunitat, barris, convivència i iniciatives socials amb impacte humà.',
    categories: ['Societat', 'Comunitat'],
    keywords: ['barri', 'veïns', 'comunitat', 'famílies', 'ciutadania'],
  },
  {
    id: 'cultura',
    label: 'Cultura',
    description:
      'Arts, llibres, patrimoni, llengua i projectes creatius que obren finestres.',
    categories: ['Cultura'],
    keywords: ['teatre', 'cinema', 'llibre', 'música', 'festival', 'patrimoni'],
  },
  {
    id: 'esports',
    label: 'Esports',
    description:
      'Esport de base, fites col·lectives i pràctiques que mouen la comunitat.',
    categories: ['Esports'],
    keywords: ['esport', 'equip', 'club', 'campionat', 'atleta'],
  },
  {
    id: 'mon-digital',
    label: 'Món digital',
    description:
      'Tecnologia i eines digitals que poden fer la vida una mica més fàcil.',
    categories: ['Tecnologia', 'Món digital'],
    keywords: [
      'intel·ligència artificial',
      'tecnologia',
      'tecnològic',
      'ciberseguretat',
      'programari',
      'robòtica',
      'algoritme',
      'videojoc',
      'xarxes socials',
    ],
  },
  {
    id: 'ciencia',
    label: 'Ciència',
    description:
      'Recerca, descobertes i coneixement que eixamplen el que sabem del món.',
    categories: ['Ciència', 'Coneixement'],
    keywords: ['recerca', 'descoberta', 'científic', 'astronomia', 'biologia', 'genètica', 'fòssil'],
  },
  {
    id: 'economia',
    label: 'Economia',
    description:
      'Feina, empreses i diners quan creen oportunitats o reparteixen millor.',
    categories: ['Economia'],
    keywords: ['empresa', 'feina', 'ocupació', 'inversió', 'pime', 'startup', 'cooperativa', 'salari'],
  },
  {
    id: 'salut',
    label: 'Salut',
    description:
      'Prevenció, cures i recerca mèdica explicades des del seu benefici social.',
    categories: ['Salut'],
    // 'cura' es va treure: en castellà vol dir "capellà" i filava notícies de
    // successos cap a Salut (cas "disfrazados de monja y cura"). El substituïm
    // per termes mèdics inequívocs.
    keywords: ['salut', 'hospital', 'sanitat', 'metge', 'vacuna', 'pacient', 'prevenció'],
  },
  {
    id: 'medi-ambient',
    label: 'Medi ambient',
    description:
      'Clima, natura, energia i biodiversitat quan hi ha solucions verificables.',
    categories: ['Medi ambient', 'Clima'],
    keywords: ['clima', 'natura', 'energia', 'biodiversitat', 'platja'],
  },
  {
    id: 'educacio',
    label: 'Educació',
    description:
      'Aprenentatge, escoles i projectes formatius amb retorn per a la societat.',
    categories: ['Educació'],
    keywords: ['escola', 'institut', 'universitat', 'alumnes', 'docents'],
  },
  {
    id: 'solidaritat',
    label: 'Solidaritat',
    description:
      'Suport mutu, voluntariat i iniciatives que no deixen ningú enrere.',
    categories: ['Solidaritat'],
    keywords: ['solidaritat', 'voluntariat', 'ajut', 'donació', 'acollida'],
  },
  {
    id: 'internacional',
    label: 'Internacional',
    description:
      'Acords, processos i bones notícies de fora que també ens afecten.',
    categories: ['Internacional', 'Món', 'Europa'],
    keywords: ['onu', 'unió europea', 'internacional'],
  },
]

const fallbackSection = editorialSections.find(
  (section) => section.id === 'societat',
)

function normalizePathname(pathname) {
  const cleanPathname = pathname || '/'
  const withLeadingSlash = cleanPathname.startsWith('/')
    ? cleanPathname
    : `/${cleanPathname}`
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '')
  return withoutTrailingSlash || '/'
}

function splitAppPath(path) {
  const rawPath = String(path || '/')
  const [pathWithoutHash] = rawPath.split('#')
  const queryIndex = pathWithoutHash.indexOf('?')
  const pathname =
    queryIndex >= 0 ? pathWithoutHash.slice(0, queryIndex) : pathWithoutHash
  const search = queryIndex >= 0 ? pathWithoutHash.slice(queryIndex) : ''

  return {
    pathname: normalizePathname(pathname),
    search,
  }
}

function normalizePath(path) {
  const { pathname, search } = splitAppPath(path)
  return `${pathname}${search}`
}

function getPathnameFromPath(path) {
  return splitAppPath(path).pathname
}

function getSearchParamsFromPath(path) {
  return new URLSearchParams(splitAppPath(path).search)
}

function getCurrentPath() {
  if (typeof window === 'undefined') {
    return '/'
  }

  return normalizePath(`${window.location.pathname}${window.location.search}`)
}

function getRoute(path) {
  const normalizedPath = getPathnameFromPath(path)

  if (normalizedPath === '/manifest') {
    return { page: 'manifest' }
  }

  if (normalizedPath === '/hemeroteca' || normalizedPath === '/arxiu') {
    return { page: 'archive' }
  }

  if (normalizedPath === '/estadistiques') {
    return { page: 'stats' }
  }

  if (
    normalizedPath === '/sobre' ||
    normalizedPath === '/quisom' ||
    normalizedPath === '/qui-som'
  ) {
    return { page: 'about' }
  }

  if (
    normalizedPath === '/privacitat' ||
    normalizedPath === '/privacidad' ||
    normalizedPath === '/privacy'
  ) {
    return { page: 'privacy' }
  }

  if (normalizedPath === '/desats' || normalizedPath === '/guardats') {
    return { page: 'saved' }
  }

  if (normalizedPath.startsWith('/noticia/')) {
    return {
      page: 'story',
      storyId: decodeURIComponent(normalizedPath.replace('/noticia/', '')),
    }
  }

  return { page: 'home' }
}

function getStoryPath(storyId) {
  return `/noticia/${encodeURIComponent(storyId)}`
}

function getCategorySlug(category) {
  if (category === 'Totes') {
    return 'totes'
  }

  return (
    editorialSections.find((section) => section.label === category)?.id ??
    'totes'
  )
}

function getCategoryFromSlug(slug) {
  if (!slug || slug === 'totes') {
    return 'Totes'
  }

  return (
    editorialSections.find((section) => section.id === slug)?.label ?? 'Totes'
  )
}

function getDistanceFilterFromSlug(slug) {
  return distanceFilterOptions.some((option) => option.id === slug)
    ? slug
    : 'progressiu'
}

function getFilterStateFromPath(path) {
  const params = getSearchParamsFromPath(path)

  return {
    category: getCategoryFromSlug(params.get('seccio')),
    distanceFilter: getDistanceFilterFromSlug(params.get('proximitat')),
    search: params.get('q') || '',
  }
}

function getFilterPath({ category = 'Totes', distanceFilter = 'progressiu', search = '' }) {
  const params = new URLSearchParams()
  const categorySlug = getCategorySlug(category)
  const cleanSearch = search.trim()

  if (categorySlug !== 'totes') {
    params.set('seccio', categorySlug)
  }

  if (distanceFilter !== 'progressiu') {
    params.set('proximitat', distanceFilter)
  }

  if (cleanSearch) {
    params.set('q', cleanSearch)
  }

  const query = params.toString()
  return query ? `/?${query}` : '/'
}

function getCanonicalUrl(path, route) {
  const { pathname } = splitAppPath(path)

  if (route.page !== 'home') {
    return `${siteUrl}${pathname}`
  }

  const params = getSearchParamsFromPath(path)
  const canonicalParams = new URLSearchParams()

  for (const key of ['seccio', 'proximitat']) {
    const value = params.get(key)

    if (value) {
      canonicalParams.set(key, value)
    }
  }

  const query = canonicalParams.toString()
  return `${siteUrl}/${query ? `?${query}` : ''}`
}

function setHeadMeta(selector, createAttributes, content) {
  let element = document.querySelector(selector)

  if (!element) {
    element = document.createElement('meta')

    for (const [name, value] of Object.entries(createAttributes)) {
      element.setAttribute(name, value)
    }

    document.head.appendChild(element)
  }

  element.setAttribute('content', content)
}

function setCanonicalLink(href) {
  let canonicalLink = document.querySelector('link[rel="canonical"]')

  if (!canonicalLink) {
    canonicalLink = document.createElement('link')
    canonicalLink.setAttribute('rel', 'canonical')
    document.head.appendChild(canonicalLink)
  }

  canonicalLink.setAttribute('href', href)
}

function normalizeStory(story) {
  const baseBody = [
    story.summary,
    `Impacte positiu: ${story.impact}.`,
    `Seguiment i context: ${story.source}.`,
  ]

  return {
    ...story,
    imageUrl: story.imageUrl?.trim() || '',
    imageAlt:
      story.imageAlt?.trim() || `Imatge associada a la noticia ${story.title}.`,
    body:
      Array.isArray(story.body) && story.body.length > 0 ? story.body : baseBody,
  }
}

const validSeedArticles = seedArticles.filter((story) => {
  if (hasOriginalPhoto(story)) return true
  if (typeof console !== 'undefined') {
    const kind = classifyImage(story?.imageUrl)
    console.warn(
      `[bondiari] Article editorial «${story.id || story.title}» descartat: imatge ${kind} ` +
        `(${story?.imageUrl || 'sense URL'}). Cal una fotografia original de la font.`,
    )
  }
  return false
})

function loadStoredTimestamp(key) {
  if (typeof window === 'undefined') {
    return ''
  }

  try {
    return window.localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function saveRefreshMetadata(updatedAt, nextRefreshAt) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (updatedAt) {
      window.localStorage.setItem(refreshStorageKey, updatedAt)
    }

    if (nextRefreshAt) {
      window.localStorage.setItem(nextRefreshStorageKey, nextRefreshAt)
    }
  } catch {
    // Si el navegador no deixa escriure, la web continua funcionant igual.
  }
}

function formatDate(value) {
  return dateFormatter.format(new Date(value))
}

function formatDateTime(value) {
  const date = new Date(value)

  if (!value || Number.isNaN(date.getTime())) {
    return ''
  }

  return dateTimeFormatter.format(date)
}

const wholeWordRegexCache = new Map()
function includesAnyKeyword(text, keywords) {
  // Coincidència per PARAULA SENCERA (no per trossos): així topònims curts com
  // "reus" o "vic" no casen dins de paraules com "nombreuses" (fr) o "victime".
  // \p{L} tracta les lletres accentuades com a part de la paraula. La regex es
  // compila un sol cop per llista (memoïtzada per referència).
  let regex = wholeWordRegexCache.get(keywords)
  if (!regex) {
    const alternation = keywords
      .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')
    regex = new RegExp(`(^|[^\\p{L}])(?:${alternation})([^\\p{L}]|$)`, 'iu')
    wholeWordRegexCache.set(keywords, regex)
  }
  return regex.test(text)
}

function getDistanceBand(story) {
  const geographicText = [
    story.location,
    story.title,
    story.summary,
    story.impact,
    story.source,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (includesAnyKeyword(geographicText, cataloniaKeywords)) {
    return distanceBandConfig[0]
  }

  if (includesAnyKeyword(geographicText, spainKeywords)) {
    return distanceBandConfig[1]
  }

  if (includesAnyKeyword(geographicText, europeKeywords)) {
    return distanceBandConfig[2]
  }

  return distanceBandConfig[3]
}

function sortByDistanceAndDate(leftStory, rightStory) {
  const leftBand = getDistanceBand(leftStory)
  const rightBand = getDistanceBand(rightStory)

  if (leftBand.rank !== rightBand.rank) {
    return leftBand.rank - rightBand.rank
  }

  return (
    new Date(rightStory.publishedAt).getTime() -
    new Date(leftStory.publishedAt).getTime()
  )
}

function normalizeSectionText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

// Comprova que la paraula clau aparegui com a PARAULA SENCERA, no com a
// fragment. Abans es feia `text.includes('ia')`, i "ia" sortia dins de
// "notícia", "família", "Iran"... i embrutava les seccions. Els límits són
// qualsevol caràcter que no sigui lletra (\p{L}, amb accents inclosos).
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function matchesWholeWord(text, keyword) {
  const re = new RegExp(`(^|[^\\p{L}])${escapeRegExp(keyword)}([^\\p{L}]|$)`, 'iu')
  return re.test(text)
}

function getStorySection(story) {
  const category = normalizeSectionText(story.category)
  const text = [
    story.category,
    story.title,
    story.summary,
    story.location,
    story.impact,
    story.source,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    editorialSections.find((section) =>
      section.categories.some(
        (sectionCategory) => normalizeSectionText(sectionCategory) === category,
      ),
    ) ??
    editorialSections.find((section) =>
      section.keywords.some((keyword) => matchesWholeWord(text, keyword)),
    ) ??
    fallbackSection
  )
}

function getSectionGroups(filteredStories, remainingStories, featuredStory) {
  return editorialSections
    .map((section) => ({
      ...section,
      totalStories: filteredStories.filter(
        (story) => getStorySection(story).id === section.id,
      ).length,
      stories: remainingStories
        .filter((story) => getStorySection(story).id === section.id)
        .sort(sortByDistanceAndDate),
      hasFeaturedStory:
        featuredStory && getStorySection(featuredStory).id === section.id,
    }))
    .filter((section) => section.totalStories >= minStoriesPerSection)
}

function estimateReadTime(summary, impact) {
  const totalWords = `${summary} ${impact}`
    .trim()
    .split(/\s+/)
    .filter(Boolean).length

  return `${Math.max(2, Math.ceil(totalWords / 35))} min`
}

function getSourceLink(story) {
  const sourceUrl = story.url?.trim()

  if (sourceUrl) {
    return {
      href: sourceUrl,
      label: sourceUrl.includes('/source.html?story=')
        ? 'Obrir la fitxa de font'
        : 'Obrir la font',
      isInternalDemo: sourceUrl.includes('/source.html?story='),
      isFallback: false,
    }
  }

  const query = encodeURIComponent(`${story.source} ${story.title}`)

  return {
    href: `https://duckduckgo.com/?q=${query}`,
    label: 'Buscar la font',
    isInternalDemo: false,
    isFallback: true,
  }
}

function getImageLink(story, fallbackLink) {
  const attributionUrl = story.imageAttributionUrl?.trim()

  if (attributionUrl) {
    return attributionUrl
  }

  return fallbackLink.href
}

function getOriginLabel(origin) {
  if (origin === 'feed') {
    return 'Radar en viu'
  }

  return 'Redacció'
}

function getOriginBadge(origin) {
  if (origin === 'feed') {
    return 'Radar en viu'
  }

  return ''
}

const LANGUAGE_LABELS = {
  ca: 'Català',
  es: 'Castellà',
  en: 'Anglès',
  fr: 'Francès',
  de: 'Alemany',
  it: 'Italià',
  pt: 'Portuguès',
}

function getLanguageLabel(code) {
  return LANGUAGE_LABELS[code] || code?.toUpperCase() || ''
}

function handleImageError(event) {
  event.currentTarget.onerror = null
  event.currentTarget.src = defaultStoryImage
}

function createFeedStory(story) {
  const now = new Date()
  const safeSummary = (story.summary || '').trim()
  const safeImpact = (story.impact || '').trim()
  const safeImageUrl = (story.imageUrl || '').trim()
  const safeUrl = (story.url || '').trim()

  if (!hasOriginalPhoto({ imageUrl: safeImageUrl })) {
    return null
  }

  return normalizeStory({
    ...story,
    id: safeUrl ? feedStoryId(safeUrl) : `feed-${now.getTime()}-${Math.floor(Math.random() * 1000)}`,
    source: (story.source || '').trim(),
    url: (story.url || '').trim(),
    imageUrl: safeImageUrl,
    imageAlt:
      story.imageAlt?.trim() ||
      `Imatge associada a la noticia ${story.title?.trim() || 'del radar en viu'}.`,
    readTime: story.readTime || estimateReadTime(safeSummary, safeImpact),
    publishedAt: story.publishedAt || now.toISOString(),
    featured: false,
    origin: 'feed',
    isFresh: story.isFresh === true,
    kicker: 'Seleccionada del radar en viu',
  })
}

function getStoryTimestamp(story) {
  const timestamp = new Date(story.publishedAt).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function sortByPublishedAtDesc(leftStory, rightStory) {
  return getStoryTimestamp(rightStory) - getStoryTimestamp(leftStory)
}

function normalizeStoryTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function getStoryKey(story) {
  const url = story.url?.trim().toLowerCase()

  if (url) {
    return `url:${url}`
  }

  return `title:${normalizeStoryTitle(story.title)}`
}

function mergeLiveStories(currentStories, liveArticles) {
  const submittedStories = currentStories.filter((story) => story.origin !== 'feed')
  const liveEditorialVersion =
    liveArticles.find((story) => story.editorialVersion)?.editorialVersion ??
    currentLiveEditorialVersion
  const protectedKeys = new Set(
    [...submittedStories, ...validSeedArticles].map((story) => getStoryKey(story)),
  )
  const currentKeys = new Set(currentStories.map((story) => getStoryKey(story)))
  const freshFeedStories = []
  let importedCount = 0

  let droppedWithoutImage = 0
  for (const liveArticle of liveArticles) {
    const nextStory = createFeedStory(liveArticle)
    if (!nextStory) {
      droppedWithoutImage += 1
      continue
    }
    const storyKey = getStoryKey(nextStory)

    if (!protectedKeys.has(storyKey)) {
      freshFeedStories.push(nextStory)
      protectedKeys.add(storyKey)

      if (!currentKeys.has(storyKey)) {
        importedCount += 1
      }
    }
  }
  if (droppedWithoutImage > 0 && typeof console !== 'undefined') {
    console.warn(
      `[bondiari] Radar en viu: ${droppedWithoutImage} notícia(es) descartades per no portar imatge.`,
    )
  }

  const previousFeedStories = currentStories.filter(
    (story) =>
      story.origin === 'feed' &&
      story.editorialVersion === liveEditorialVersion &&
      !freshFeedStories.some(
        (freshStory) => getStoryKey(freshStory) === getStoryKey(story),
      ),
  )
  const feedStories = [...freshFeedStories, ...previousFeedStories]
    .sort(sortByPublishedAtDesc)
    .slice(0, maxStoredFeedStories)

  return {
    importedCount,
    stories: [...submittedStories, ...feedStories],
  }
}

function splitEditionStories(stories) {
  const now = Date.now()
  const sortedByAge = [...stories].sort(sortByPublishedAtDesc)
  // Només poden ser a la portada les notícies de menys de 2 dies. Les més
  // velles van sempre a l'hemeroteca, encara que hi hagi lloc a la portada.
  const recent = sortedByAge.filter(
    (story) => now - new Date(story.publishedAt).getTime() <= activeEditionMaxAgeMs,
  )
  // Si hi ha prou notícies fresques, la portada són només aquestes (les velles
  // van a la Hemeroteca). Però si avui n'hi ha poques o cap de < 2 dies, no
  // deixem la portada buida: agafem les més noves disponibles fins al terra.
  const pool =
    recent.length >= activeEditionFloor
      ? recent
      : sortedByAge.slice(0, Math.max(activeEditionFloor, recent.length))
  const activeStoryIds = new Set()

  // Primer, una peça per secció (del pool) per garantir cobertura diària.
  for (const section of editorialSections) {
    const sectionStory = pool.find(
      (story) => getStorySection(story).id === section.id,
    )

    if (sectionStory && activeStoryIds.size < activeEditionLimit) {
      activeStoryIds.add(sectionStory.id)
    }
  }

  // Després, omplim amb les més noves fins al límit d'edició.
  for (const story of pool) {
    if (activeStoryIds.size >= activeEditionLimit) {
      break
    }

    activeStoryIds.add(story.id)
  }

  return {
    activeStories: pool
      .filter((story) => activeStoryIds.has(story.id))
      .sort(sortByDistanceAndDate),
    // Hemeroteca: la resta (les que no caben i les més velles).
    archiveStories: sortedByAge.filter((story) => !activeStoryIds.has(story.id)),
  }
}

function canInterceptNavigation(event) {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
}

function SiteHeader({ currentPage, isRefreshing, onNavigate, onRefresh }) {
  const navItems = [
    { href: '/', label: 'Portada', page: 'home' },
    { href: '/manifest', label: 'Manifest', page: 'manifest' },
    { href: '/hemeroteca', label: 'Hemeroteca', page: 'archive' },
    { href: '/desats', label: 'Desats', page: 'saved' },
  ]
  const [isOwner] = useState(readOwnerFlag)

  return (
    <header className="masthead">
      <div className="masthead__top">
        <div className="masthead__utility">
          <p className="issue-chip">Edició del {formatDate(new Date())}</p>
          <nav className="site-nav" aria-label="Navegació principal">
            {navItems.map((item) => (
              <a
                key={item.href}
                className={`site-nav__link ${
                  currentPage === item.page ? 'is-active' : ''
                }`}
                href={item.href}
                aria-current={currentPage === item.page ? 'page' : undefined}
                onClick={(event) => {
                  if (!canInterceptNavigation(event)) {
                    return
                  }

                  event.preventDefault()
                  onNavigate(item.href)
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        {isOwner ? (
          <div className="masthead__actions">
            <button
              className={`button button--ghost ${isRefreshing ? 'is-loading' : ''}`}
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Sincronitzant 3CatInfo...' : 'Refrescar de debò'}
            </button>
          </div>
        ) : null}
      </div>

      <div className="masthead__brand masthead__brand--graphis">
        <p className="section-tag">Diari constructiu i optimista</p>

        <a
          className="graphis-title-band"
          href="/"
          aria-label="Tornar a la portada d'El Bon Diari"
          onClick={(event) => {
            if (!canInterceptNavigation(event)) {
              return
            }
            event.preventDefault()
            onNavigate('/')
          }}
        >
          <span className="graphis-title">EL BON DIARI</span>
          <span className="graphis-title-bird" aria-hidden="true">
            <img src="/logo-colibri.png?v=4" alt="" />
          </span>
        </a>

        <div className="mondrian-grid" aria-hidden="true">
          <span className="m-cell m-red"></span>
          <span className="m-cell m-blue"></span>
          <span className="m-cell m-yellow"></span>
          <span className="m-cell m-red"></span>

          <span className="m-cell m-black"></span>
          <span className="m-cell m-center">
            <img src="/logo-colibri.png?v=4" alt="" />
          </span>
          <span className="m-cell m-yellow"></span>

          <span className="m-cell m-red"></span>
          <span className="m-cell m-blue"></span>

          <span className="m-cell m-blue"></span>
          <span className="m-cell m-yellow"></span>
          <span className="m-cell m-white"></span>
          <span className="m-cell m-black"></span>
        </div>

        <p className="masthead__lead">
          El diari que només deixa passar històries que reparen el món, cuiden
          la gent o demostren que una idea bona es pot replicar.
        </p>
      </div>
    </header>
  )
}

function StoryCard({ story, onNavigate }) {
  const storyPath = getStoryPath(story.id)
  const originBadge = getOriginBadge(story.origin)
  const distanceBand = getDistanceBand(story)
  const storySection = getStorySection(story)

  return (
    <a
      className="story-card"
      href={storyPath}
      onClick={(event) => {
        if (!canInterceptNavigation(event)) {
          return
        }

        event.preventDefault()
        onNavigate(storyPath)
      }}
    >
      <div className="story-card__media">
        <img
          className="story-card__image"
          src={story.imageUrl}
          alt=""
          loading="lazy"
          onError={handleImageError}
        />
      </div>

      <div className="story-card__header">
        <div className="story-card__chips">
          <span className="paper-chip">{storySection.label}</span>
          <span className="paper-chip paper-chip--subtle">
            {distanceBand.label}
          </span>
          {story.language && story.language !== 'ca' ? (
            <span
              className="paper-chip paper-chip--lang"
              title={getLanguageLabel(story.language)}
            >
              {story.language.toUpperCase()}
            </span>
          ) : null}
          {story.isFresh ? (
            <span
              className="paper-chip paper-chip--fresh"
              title="Nova en aquest refresc"
            >
              <span className="paper-chip__dot" aria-hidden="true" />
              Nou
            </span>
          ) : null}
        </div>
        <span className="story-card__time">{story.readTime}</span>
      </div>

      <h3>{story.title}</h3>
      <p className="story-card__summary">{story.summary || story.impact}</p>

      <div className="story-card__footer">
        <span>{story.location}</span>
        <span>{formatDate(story.publishedAt)}</span>
      </div>

      {originBadge ? <span className="origin-badge">{originBadge}</span> : null}
    </a>
  )
}

function readOwnerFlag() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('bondiari-owner') === '1'
  } catch {
    return false
  }
}

function FooterNote({ onNavigate }) {
  const year = new Date().getFullYear()
  const [isOwner] = useState(readOwnerFlag)
  return (
    <footer className="footer-note">
      <p>
        <strong>El Bon Diari</strong> · Concepte, edició i disseny:{' '}
        <a
          href="https://sergicastillo.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Sergi Castillo
        </a>
        .
      </p>
      <p>
        Diari constructiu amb actualització automàtica, Hemeroteca i criteri
        editorial propi. Les fonts citades són dels seus autors; les imatges,
        dels mitjans que s'hi vinculen.{' '}
        <a
          className="footer-note__owner-link"
          href="/sobre"
          onClick={(event) => {
            if (!canInterceptNavigation(event) || !onNavigate) return
            event.preventDefault()
            onNavigate('/sobre')
          }}
        >
          Sobre · llicència
        </a>
        {' · '}
        <a
          className="footer-note__owner-link"
          href="/privacitat"
          onClick={(event) => {
            if (!canInterceptNavigation(event) || !onNavigate) return
            event.preventDefault()
            onNavigate('/privacitat')
          }}
        >
          Privacitat
        </a>
        .
      </p>
      <p className="footer-note__copy">
        © {year} El Bon Diari · bondiari.com
        {isOwner ? (
          <>
            {' · '}
            <a
              className="footer-note__owner-link"
              href="/estadistiques"
              onClick={(event) => {
                if (!canInterceptNavigation(event) || !onNavigate) return
                event.preventDefault()
                onNavigate('/estadistiques')
              }}
            >
              Estadístiques
            </a>
          </>
        ) : null}
      </p>
    </footer>
  )
}

function AboutPage({ onNavigate }) {
  return (
    <>
      <PageHero
        tag="Qui hi ha darrere"
        title="El Bon Diari és un diari editorial petit i obert."
        description="Aquesta pàgina explica qui hi ha darrere, com es trien les notícies, què es recull sobre tu i amb quina llicència es publica."
      />

      <article className="section-block about-block">
        <section className="about-block__section">
          <h2>Qui hi ha darrere</h2>
          <p>
            El Bon Diari el porta{' '}
            <a
              href="https://sergicastillo.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Sergi Castillo
            </a>
            , filòsof i editor. Concepte, selecció editorial, disseny i
            manteniment són responsabilitat seva. Per a qualsevol consulta o
            suggeriment de notícia, pots escriure a{' '}
            <a href="mailto:sergicas@gmail.com">sergicas@gmail.com</a>.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Quin criteri segueix</h2>
          <p>
            Aquí només entren bones notícies verificables: històries amb font,
            impacte mesurable i utilitat per a qui les llegeix. No hi ha optimisme
            buit ni opinió per opinar. Si vols veure el marc complet, llegeix el{' '}
            <a
              href="/manifest"
              onClick={(event) => {
                if (!canInterceptNavigation(event) || !onNavigate) return
                event.preventDefault()
                onNavigate('/manifest')
              }}
            >
              Manifest editorial
            </a>
            .
          </p>
        </section>

        <section className="about-block__section">
          <h2>Què recollim sobre tu</h2>
          <p>
            <strong>El menys possible.</strong> El Bon Diari no usa cookies de
            seguiment ni serveis d’analítica externs (no hi ha Google Analytics,
            Facebook Pixel, AdSense ni similars). Tampoc demana cap dada
            personal per llegir.
          </p>
          <p>
            Comptem visites amb un comptador propi i agregat: cada visita es
            converteix en una xifra anònima al servidor (pàgina, dispositiu i
            origen aproximat). No es desa cap identificador, IP ni perfil de
            lector. Aquestes xifres no surten d’El Bon Diari ni es venen a
            ningú. Si ets propietari, pots veure-les al{' '}
            <a
              href="/estadistiques"
              onClick={(event) => {
                if (!canInterceptNavigation(event) || !onNavigate) return
                event.preventDefault()
                onNavigate('/estadistiques')
              }}
            >
              panell d’estadístiques
            </a>
            .
          </p>
          <p>
            Si vols excloure’t del comptador al teu navegador, obre el panell
            d’estadístiques una vegada: el botó “Exclou-me del comptador” deixa
            una marca local i les teves visites deixen de comptar.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Llicència del contingut</h2>
          <p>
            Les peces editorials d’El Bon Diari es publiquen sota llicència{' '}
            <a
              href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ca"
              target="_blank"
              rel="noopener noreferrer"
            >
              Creative Commons BY-NC-SA 4.0
            </a>
            : pots reutilitzar-les si en cites l’autoria, no en fas un ús
            comercial i compartides amb la mateixa llicència.
          </p>
          <p>
            Les fonts i imatges enllaçades pertanyen als mitjans originals
            (Generalitat de Catalunya, ONU, UNESCO, Nature, Wikimedia,
            IEEE Spectrum, etc.) i mantenen la seva pròpia llicència. El Bon
            Diari només n’enllaça els documents originals com a font verificable
            de cada peça.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Tecnologia</h2>
          <p>
            Web feta amb React + Vite, allotjada a Netlify, publicada des de
            Tarragona. Codi obert i editable: si trobes un error, una millora
            d’accessibilitat o una bona notícia que ens hauria d’interessar,
            escriu-nos.
          </p>
        </section>
      </article>
    </>
  )
}

function PrivacyPage({ onNavigate }) {
  return (
    <>
      <PageHero
        tag="Privacitat"
        title="Política de privacitat"
        description="Què recollim, per què i com pots controlar-ho. En resum: el mínim imprescindible, sense seguiment publicitari ni venda de dades."
      />

      <article className="section-block about-block">
        <section className="about-block__section">
          <p>
            <strong>Última actualització: 4 de juliol de 2026.</strong>
          </p>
          <p>
            El Bon Diari (bondiari.com) i l’app «El Bon Diari» són un projecte
            editorial de <strong>Sergi Castillo</strong>, responsable del
            tractament de dades. Per a qualsevol qüestió de privacitat pots
            escriure a{' '}
            <a href="mailto:sergicas@gmail.com">sergicas@gmail.com</a>. Aquesta
            política s’aplica igual al web i a l’app d’iOS.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Llegir no requereix cap dada</h2>
          <p>
            Pots llegir El Bon Diari, al web o a l’app, sense registrar-te ni
            facilitar cap dada personal. No usem cookies de seguiment ni serveis
            d’analítica de tercers: no hi ha Google Analytics, Meta Pixel,
            AdSense ni similars, ni al web ni a l’app.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Comptador de visites (anònim i agregat)</h2>
          <p>
            Comptem visites amb un comptador propi. Cada visita es converteix en
            una xifra anònima al servidor (pàgina, tipus de dispositiu i origen
            aproximat). <strong>No desem cap identificador, adreça IP ni perfil
            de lector</strong>, i aquestes xifres no surten d’El Bon Diari ni es
            venen a ningú. Per excloure’t al teu navegador, obre el{' '}
            <a
              href="/estadistiques"
              onClick={(event) => {
                if (!canInterceptNavigation(event) || !onNavigate) return
                event.preventDefault()
                onNavigate('/estadistiques')
              }}
            >
              panell d’estadístiques
            </a>{' '}
            i prem «Exclou-me del comptador».
          </p>
        </section>

        <section className="about-block__section">
          <h2>Butlletí (newsletter)</h2>
          <p>
            Si t’hi subscrius voluntàriament, guardem la teva{' '}
            <strong>adreça de correu</strong> i l’idioma escollit amb l’únic
            objectiu d’enviar-te el recull de bones notícies. No la compartim ni
            la venem. Pots donar-te de baixa en qualsevol moment amb l’enllaç del
            peu de cada correu, o escrivint-nos. L’enviament el gestiona el
            proveïdor de correu Resend i les adreces es desen xifrades a la
            infraestructura de Cloudflare.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Notificacions push</h2>
          <p>
            Si actives les notificacions (al web o a l’app), el teu dispositiu
            genera un <strong>testimoni de subscripció</strong> —al web, una
            subscripció Web Push; a l’app, un «device token» d’Apple (APNs)— que
            desem per poder-te enviar la bona notícia del dia. Aquest testimoni{' '}
            <strong>no ens identifica personalment</strong> i no s’associa a cap
            altra dada teva. Pots desactivar les notificacions quan vulguis des
            de la configuració del navegador o del dispositiu, i el testimoni
            deixa d’usar-se (i s’elimina quan Apple o el navegador ens indiquen
            que ja no és vàlid).
          </p>
        </section>

        <section className="about-block__section">
          <h2>Emmagatzematge local al dispositiu</h2>
          <p>
            Fem servir l’emmagatzematge local del navegador o de l’app només per
            recordar preferències teves (per exemple, si t’has exclòs del
            comptador o l’estat de la subscripció push). Aquesta informació es
            queda al teu dispositiu i no s’envia enlloc.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Amb qui es comparteix</h2>
          <p>
            Només amb els proveïdors tècnics imprescindibles per fer funcionar el
            servei, com a encarregats del tractament:{' '}
            <strong>Cloudflare</strong> (allotjament, base de dades i enviament de
            notificacions), <strong>Resend</strong> (enviament del butlletí) i,
            per a l’app, <strong>Apple</strong> (lliurament de les notificacions
            push). No venem, lloguem ni cedim dades a tercers amb finalitats
            publicitàries.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Conservació</h2>
          <p>
            Conservem la teva adreça del butlletí mentre segueixis subscrit; si
            et dones de baixa, la deixem d’utilitzar i l’eliminem. Els testimonis
            de notificacions es conserven mentre estiguin actius i s’eliminen quan
            caduquen o desactives les notificacions. Les xifres del comptador són
            anònimes i agregades des de l’origen.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Els teus drets</h2>
          <p>
            Pots demanar accés, rectificació o supressió de les teves dades, i
            oposar-te’n al tractament, escrivint a{' '}
            <a href="mailto:sergicas@gmail.com">sergicas@gmail.com</a>. Com que no
            desem perfils ni identificadors dels lectors, la majoria de dades es
            limiten al correu del butlletí i als testimonis de notificacions, que
            pots eliminar tu mateix donant-te de baixa o desactivant-les.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Menors</h2>
          <p>
            El Bon Diari és un servei de notícies d’interès general, no dirigit
            específicament a menors, i no recull dades conscientment de menors
            d’edat.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Canvis en aquesta política</h2>
          <p>
            Si actualitzem aquesta política, en canviarem la data d’aquesta
            pàgina. Els canvis rellevants es comunicaran pels canals habituals
            d’El Bon Diari.
          </p>
        </section>
      </article>
    </>
  )
}

function SavedPage({ onNavigate }) {
  const [items, setItems] = useState(getSaved)

  useEffect(() => {
    function sync() {
      setItems(getSaved())
    }
    window.addEventListener(SAVED_EVENT, sync)
    return () => window.removeEventListener(SAVED_EVENT, sync)
  }, [])

  return (
    <>
      <PageHero
        tag="La teva col·lecció"
        title="Desats per llegir després"
        description="Els articles que guardes es queden al teu dispositiu: els pots rellegir aquí quan vulguis, fins i tot sense connexió."
      />

      <section className="section-block">
        {items.length === 0 ? (
          <div className="saved-empty">
            <h2>Encara no has desat cap notícia.</h2>
            <p>
              Quan trobis una bona notícia que vulguis rellegir, prem{' '}
              <strong>«Desa per llegir després»</strong> i la tindràs aquí a mà,
              també quan estiguis sense connexió.
            </p>
            <a
              className="button button--primary"
              href="/"
              onClick={(event) => {
                if (!canInterceptNavigation(event) || !onNavigate) return
                event.preventDefault()
                onNavigate('/')
              }}
            >
              Explora la portada
            </a>
          </div>
        ) : (
          <ul className="saved-list">
            {items.map((story) => (
              <li key={story.id} className="saved-card">
                {story.imageUrl ? (
                  <img
                    className="saved-card__image"
                    src={story.imageUrl}
                    alt={story.imageAlt}
                    onError={handleImageError}
                    loading="lazy"
                  />
                ) : null}
                <div className="saved-card__content">
                  <div className="saved-card__meta">
                    {story.category ? (
                      <span className="paper-chip">{story.category}</span>
                    ) : null}
                    {story.publishedAt ? (
                      <span className="saved-card__date">
                        {formatDate(story.publishedAt)}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="saved-card__title">{story.title}</h2>
                  {story.summary ? (
                    <p className="saved-card__summary">{story.summary}</p>
                  ) : null}
                  {story.impact ? (
                    <p className="saved-card__impact">
                      <strong>Impacte:</strong> {story.impact}
                    </p>
                  ) : null}
                  {story.body && story.body.length > 0 ? (
                    <details className="saved-card__full">
                      <summary>Llegeix l'article complet</summary>
                      {story.body.map((paragraph, index) => (
                        <p key={`${story.id}-${index}`}>{paragraph}</p>
                      ))}
                    </details>
                  ) : null}
                  <div className="saved-card__actions">
                    <a
                      className="saved-card__link"
                      href={`/noticia/${encodeURIComponent(story.id)}`}
                      onClick={(event) => {
                        if (!canInterceptNavigation(event) || !onNavigate) return
                        event.preventDefault()
                        onNavigate(`/noticia/${encodeURIComponent(story.id)}`)
                      }}
                    >
                      Obre la pàgina
                    </a>
                    {story.url ? (
                      <a
                        className="saved-card__link"
                        href={story.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Font original
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="saved-card__remove"
                      onClick={() => removeSaved(story.id)}
                    >
                      Treu dels desats
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function markOwnerAndRead() {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem('bondiari-owner', '1')
    return true
  } catch {
    return false
  }
}

function StatsPage({ allStories }) {
  const [stats, setStats] = useState(null)
  const [status, setStatus] = useState('loading')
  const [isOwner, setIsOwner] = useState(markOwnerAndRead)

  useEffect(() => {
    let cancelled = false

    fetch('/api/stats')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => {
        if (cancelled) return
        setStats(data)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function toggleOwner() {
    try {
      if (isOwner) {
        window.localStorage.removeItem('bondiari-owner')
        setIsOwner(false)
      } else {
        window.localStorage.setItem('bondiari-owner', '1')
        setIsOwner(true)
      }
    } catch {
      // localStorage no disponible
    }
  }

  const titleByPath = new Map()
  if (allStories) {
    for (const story of allStories) {
      titleByPath.set(`/noticia/${encodeURIComponent(story.id)}`, story.title)
    }
  }
  titleByPath.set('/', 'Portada')
  titleByPath.set('/manifest', 'Manifest editorial')
  titleByPath.set('/hemeroteca', 'Hemeroteca')

  const ownerBanner = (
    <section className={`owner-banner ${isOwner ? 'is-on' : 'is-off'}`}>
      <div>
        <strong>
          {isOwner
            ? 'Les teves visites no s’estan comptant.'
            : 'Les teves visites s’estan comptant.'}
        </strong>
        <p>
          {isOwner
            ? 'Aquest navegador està marcat com a propietari. Cap navegació teva no s’afegeix al total.'
            : 'Per excloure’t un altre cop, prem el botó. Si esborres dades del navegador, hauràs de tornar-ho a marcar.'}
        </p>
      </div>
      <button
        type="button"
        className="button button--ghost"
        onClick={toggleOwner}
      >
        {isOwner ? 'Tornar a comptar-me' : 'Exclou-me del comptador'}
      </button>
    </section>
  )

  if (status === 'loading') {
    return (
      <>
        <PageHero
          tag="Estadístiques"
          title="El pols de lectura d’El Bon Diari"
          description="Comptador propi sense cookies ni serveis externs: només pàgina, origen i mida de pantalla, agregats."
        />
        {ownerBanner}
        <section className="section-block">
          <h2>Carregant dades…</h2>
        </section>
      </>
    )
  }

  if (status === 'error' || !stats) {
    return (
      <>
        <PageHero
          tag="Estadístiques"
          title="El pols de lectura d’El Bon Diari"
          description="Comptador propi sense cookies ni serveis externs: només pàgina, origen i mida de pantalla, agregats."
        />
        {ownerBanner}
        <section className="section-block">
          <h2>Encara no hi ha dades a mostrar.</h2>
          <p>Quan la pàgina rebi visites, apareixeran aquí.</p>
        </section>
      </>
    )
  }

  const dailyMax = stats.daily.reduce((max, d) => Math.max(max, d.count), 0) || 1
  const last7 = stats.daily.slice(-7).reduce((sum, d) => sum + d.count, 0)
  const last30 = stats.daily.reduce((sum, d) => sum + d.count, 0)
  const totalDevices = Object.values(stats.devices).reduce(
    (sum, v) => sum + Number(v || 0),
    0,
  ) || 1

  return (
    <>
      <PageHero
        tag="Estadístiques"
        title="El pols de lectura d’El Bon Diari"
        description="Comptador propi sense cookies ni serveis externs: només pàgina, origen i mida de pantalla, agregats."
      />

      {ownerBanner}

      <section className="stats-grid">
        <article className="stats-card stats-card--big">
          <span className="stats-card__label">Visites totals</span>
          <strong>{stats.total.toLocaleString('ca-ES')}</strong>
        </article>
        <article className="stats-card">
          <span className="stats-card__label">Últims 7 dies</span>
          <strong>{last7.toLocaleString('ca-ES')}</strong>
        </article>
        <article className="stats-card">
          <span className="stats-card__label">Últims 30 dies</span>
          <strong>{last30.toLocaleString('ca-ES')}</strong>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="section-tag">Activitat diària</p>
            <h2>Visites dia a dia</h2>
          </div>
          <p className="section-caption">
            Es mostren els darrers 30 dies registrats.
          </p>
        </div>
        <div className="stats-bars">
          {stats.daily.length === 0 ? (
            <p className="news-section__placeholder">
              Encara no hi ha cap dia registrat.
            </p>
          ) : (
            stats.daily.map((row) => (
              <div key={row.day} className="stats-bar">
                <span className="stats-bar__day">{row.day}</span>
                <div className="stats-bar__track">
                  <div
                    className="stats-bar__fill"
                    style={{ width: `${(row.count / dailyMax) * 100}%` }}
                  />
                </div>
                <span className="stats-bar__count">{row.count}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="section-tag">Continguts</p>
            <h2>Pàgines més llegides</h2>
          </div>
        </div>
        <ol className="stats-list">
          {stats.topPaths.length === 0 ? (
            <li className="news-section__placeholder">Cap visita encara.</li>
          ) : (
            stats.topPaths.map((row) => (
              <li key={row.key} className="stats-list__item">
                <span className="stats-list__primary">
                  {titleByPath.get(row.key) || row.key}
                </span>
                <span className="stats-list__secondary">{row.key}</span>
                <span className="stats-list__count">{row.count}</span>
              </li>
            ))
          )}
        </ol>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="section-tag">Orígens</p>
            <h2>D’on arriben els lectors</h2>
          </div>
        </div>
        <ol className="stats-list">
          {stats.topReferrers.length === 0 ? (
            <li className="news-section__placeholder">Cap origen encara.</li>
          ) : (
            stats.topReferrers.map((row) => (
              <li key={row.key} className="stats-list__item">
                <span className="stats-list__primary">{row.key}</span>
                <span className="stats-list__count">{row.count}</span>
              </li>
            ))
          )}
        </ol>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="section-tag">Dispositius</p>
            <h2>Per on llegeixen</h2>
          </div>
        </div>
        <div className="stats-devices">
          {['mobile', 'tablet', 'desktop', 'unknown'].map((key) => {
            const value = Number(stats.devices[key] || 0)
            const pct = Math.round((value / totalDevices) * 100)
            const label =
              key === 'mobile'
                ? 'Mòbil'
                : key === 'tablet'
                ? 'Tauleta'
                : key === 'desktop'
                ? 'Ordinador'
                : 'Sense detectar'
            return (
              <article key={key} className="stats-device">
                <span className="stats-device__label">{label}</span>
                <strong>{value.toLocaleString('ca-ES')}</strong>
                <small>{pct}%</small>
              </article>
            )
          })}
        </div>
      </section>
    </>
  )
}

function MostReadSection({ allStories, onNavigate }) {
  const [topStories, setTopStories] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false
    fetch('/api/stats')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => {
        if (cancelled) return
        const byPath = new Map(
          allStories.map((s) => [`/noticia/${encodeURIComponent(s.id)}`, s]),
        )
        const selected = []
        for (const row of data.topPaths || []) {
          const story = byPath.get(row.key)
          if (story) selected.push({ story, count: row.count })
          if (selected.length >= 3) break
        }
        setTopStories(selected)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [allStories])

  if (status !== 'ready' || !topStories || topStories.length === 0) {
    return null
  }

  return (
    <section className="section-block most-read-block">
      <div className="section-heading">
        <div>
          <p className="section-tag">Llegides al moment</p>
          <h2>Les peces amb més lectures aquesta setmana</h2>
        </div>
      </div>
      <ol className="most-read-list">
        {topStories.map((entry, index) => {
          const path = `/noticia/${encodeURIComponent(entry.story.id)}`
          return (
            <li key={entry.story.id} className="most-read-item">
              <span className="most-read-item__rank">
                {String(index + 1).padStart(2, '0')}
              </span>
              <a
                className="most-read-item__title"
                href={path}
                onClick={(event) => {
                  if (!canInterceptNavigation(event) || !onNavigate) return
                  event.preventDefault()
                  onNavigate(path)
                }}
              >
                {entry.story.title}
              </a>
              <span className="most-read-item__meta">
                {entry.story.category} · {entry.count} lectures
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function StoryPage({ story, sourceLink, imageLink, relatedStories, onNavigate }) {
  const distanceBand = getDistanceBand(story)
  const storySection = getStorySection(story)

  return (
    <>
      <PageHero
        headingLevel="h2"
        tag="Pàgina d'article"
        title={story.title}
        description={story.summary || story.impact}
        actions={
          <>
            <a
              className="button button--ghost"
              href="/"
              onClick={(event) => {
                if (!canInterceptNavigation(event)) {
                  return
                }

                event.preventDefault()
                onNavigate('/')
              }}
            >
              Tornar a la portada
            </a>
            <a
              className="button button--primary"
              href={sourceLink.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {sourceLink.label}
            </a>
          </>
        }
      />

      <article className="article-page">
        <div className="article-page__header">
          <div className="story-modal__chips">
            <span className="paper-chip">{storySection.label}</span>
            <span className="paper-chip paper-chip--subtle">
              {distanceBand.label}
            </span>
            <span className="paper-chip paper-chip--subtle">
              {getOriginLabel(story.origin)}
            </span>
          </div>
          <p className="article-page__kicker">{story.kicker}</p>
          <h1 className="article-page__title">{story.title}</h1>
        </div>

        <div className="article-page__lead">
          <div className="article-page__media">
            <a
              className="story-image-link"
              href={imageLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                className="article-page__image"
                src={story.imageUrl}
                alt={story.imageAlt}
                onError={handleImageError}
              />
            </a>
            {story.imageCredit ? (
              <p className="image-credit">{story.imageCredit}</p>
            ) : null}
          </div>

          <aside className="article-page__aside">
            <article className="story-modal__detail-card">
              <span>Publicada</span>
              <strong>{formatDate(story.publishedAt)}</strong>
            </article>
            <article className="story-modal__detail-card">
              <span>Lloc</span>
              <strong>{story.location}</strong>
            </article>
            <article className="story-modal__detail-card">
              <span>Proximitat editorial</span>
              <strong>{distanceBand.editorialLabel}</strong>
            </article>
            <article className="story-modal__detail-card">
              <span>Temps de lectura</span>
              <strong>{story.readTime}</strong>
            </article>
            <article className="story-modal__detail-card">
              <span>Impacte</span>
              <strong>{story.impact}</strong>
            </article>
          </aside>
        </div>

        <div className="article-page__body">
          {story.body.map((paragraph) => (
            <p key={`${story.id}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
          ))}
        </div>

        <div className="article-page__save">
          <SaveButton story={story} />
        </div>

        <ShareRow story={story} />

        <div className="article-page__footer">
          <div className="story-modal__source">
            <span>Font</span>
            <a
              className="source-link"
              href={sourceLink.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {story.source}
            </a>
            {sourceLink.isFallback ? (
              <small className="source-note">
                Sense URL directa: obrim una cerca de referència.
              </small>
            ) : null}
            {sourceLink.isInternalDemo ? (
              <small className="source-note">
                Aquesta peça obre una fitxa de font vinculada a la notícia.
              </small>
            ) : null}
          </div>

          <div className="story-modal__buttons">
            <a
              className="button button--ghost"
              href="/"
              onClick={(event) => {
                if (!canInterceptNavigation(event)) {
                  return
                }

                event.preventDefault()
                onNavigate('/')
              }}
            >
              Tornar a la portada
            </a>
            <a
              className="button button--primary"
              href={sourceLink.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              Llegir la font original
            </a>
          </div>
        </div>
      </article>

      {relatedStories.length > 0 ? (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="section-tag">Relacionades</p>
              <h2>Altres peces de la mateixa edició</h2>
            </div>
          </div>

          <div className="news-grid">
            {relatedStories.map((relatedStory) => (
              <StoryCard
                key={relatedStory.id}
                story={relatedStory}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}

function ArchivePage({ archiveStories, lastRefreshLabel, onNavigate }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [langFilter, setLangFilter] = useState('all')

  const availableSources = [...new Set(archiveStories.map((s) => s.source).filter(Boolean))].sort()
  const availableLanguages = [...new Set(archiveStories.map((s) => s.language).filter(Boolean))].sort()

  const normalizedQuery = searchTerm.trim().toLowerCase()
  const filtered = archiveStories.filter((story) => {
    if (sourceFilter !== 'all' && story.source !== sourceFilter) return false
    if (langFilter !== 'all' && story.language !== langFilter) return false
    if (!normalizedQuery) return true
    const haystack = `${story.title || ''} ${story.summary || ''} ${story.impact || ''} ${story.source || ''} ${story.location || ''}`.toLowerCase()
    return haystack.includes(normalizedQuery)
  })

  const hasFilters = normalizedQuery !== '' || sourceFilter !== 'all' || langFilter !== 'all'

  const resetFilters = () => {
    setSearchTerm('')
    setSourceFilter('all')
    setLangFilter('all')
  }

  return (
    <>
      <PageHero
        tag="Hemeroteca"
        title="Les bones notícies no desapareixen: queden guardades per tornar-hi."
        description={`Les notícies de més de 2 dies surten de la portada i es guarden aquí. Ara mateix hi ha ${archiveStories.length} històries ordenades de més recent a més llunyana.`}
        actions={
          <a
            className="button button--primary"
            href="/"
            onClick={(event) => {
              if (!canInterceptNavigation(event)) {
                return
              }

              event.preventDefault()
              onNavigate('/')
            }}
          >
            Tornar a la portada
          </a>
        }
      />

      <section className="section-block archive-section">
        <div className="section-heading">
          <div>
            <p className="section-tag">Notícies antigues</p>
            <h2>Hemeroteca</h2>
          </div>
          <p className="section-caption">
            {lastRefreshLabel
              ? `Última actualització del radar: ${lastRefreshLabel}.`
              : 'El radar encara espera la primera actualització publicada.'}
          </p>
        </div>

        {archiveStories.length > 0 ? (
          <>
            <div className="archive-toolbar" role="search" aria-label="Cerca a la hemeroteca">
              <label className="archive-toolbar__field archive-toolbar__field--search">
                <span>Cercar per paraula</span>
                <input
                  type="search"
                  placeholder="Títol, font, lloc..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
              <label className="archive-toolbar__field">
                <span>Font</span>
                <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                  <option value="all">Totes les fonts</option>
                  {availableSources.map((source) => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
              </label>
              <label className="archive-toolbar__field">
                <span>Idioma</span>
                <select value={langFilter} onChange={(event) => setLangFilter(event.target.value)}>
                  <option value="all">Tots els idiomes</option>
                  {availableLanguages.map((code) => (
                    <option key={code} value={code}>{getLanguageLabel(code)}</option>
                  ))}
                </select>
              </label>
              {hasFilters ? (
                <button type="button" className="archive-toolbar__reset" onClick={resetFilters}>
                  Esborrar filtres
                </button>
              ) : null}
            </div>
            <p className="archive-toolbar__count">
              {hasFilters ? `${filtered.length} de ${archiveStories.length} peces` : `${archiveStories.length} peces`}
            </p>
            {filtered.length > 0 ? (
              <div className="news-grid">
                {filtered.map((story) => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h3>Cap peça coincideix amb la cerca.</h3>
                <p>Prova amb una paraula més senzilla o esborra els filtres.</p>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <h3>La Hemeroteca encara és buida.</h3>
            <p>
              Quan una notícia passa dels 2 dies, surt de la portada i queda
              guardada aquí automàticament.
            </p>
          </div>
        )}
      </section>
    </>
  )
}

function App() {
  const initialFilterState = getFilterStateFromPath(getCurrentPath())
  const [liveStories, setLiveStories] = useState([])
  const [searchTerm, setSearchTerm] = useState(initialFilterState.search)
  const [activeCategory, setActiveCategory] = useState(
    initialFilterState.category,
  )
  const [activeDistanceFilter, setActiveDistanceFilter] = useState(
    initialFilterState.distanceFilter,
  )
  const [currentPath, setCurrentPath] = useState(getCurrentPath)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefreshAt, setLastRefreshAt] = useState(() =>
    loadStoredTimestamp(refreshStorageKey),
  )
  const [, setNextRefreshAt] = useState(() =>
    loadStoredTimestamp(nextRefreshStorageKey),
  )
  const route = getRoute(currentPath)

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(getCurrentPath())
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (route.page !== 'home') {
      return
    }

    const nextFilterState = getFilterStateFromPath(currentPath)

    setSearchTerm((currentSearch) =>
      currentSearch === nextFilterState.search
        ? currentSearch
        : nextFilterState.search,
    )
    setActiveCategory((currentCategory) =>
      currentCategory === nextFilterState.category
        ? currentCategory
        : nextFilterState.category,
    )
    setActiveDistanceFilter((currentDistanceFilter) =>
      currentDistanceFilter === nextFilterState.distanceFilter
        ? currentDistanceFilter
        : nextFilterState.distanceFilter,
    )
  }, [currentPath, route.page])

  useEffect(() => {
    let isCancelled = false

    async function updateFromRadar() {
      try {
        const payload = await fetchLivePositiveNewsPayload()

        if (isCancelled) {
          return
        }

        setLiveStories((currentStories) =>
          mergeLiveStories(currentStories, payload.stories).stories,
        )

        const updatedAt = payload.updatedAt || new Date().toISOString()
        const nextAt =
          payload.nextRefreshAt ||
          new Date(Date.now() + autoRefreshIntervalMs).toISOString()

        setLastRefreshAt(updatedAt)
        setNextRefreshAt(nextAt)
        saveRefreshMetadata(updatedAt, nextAt)
      } catch (error) {
        console.warn('No s’ha pogut actualitzar automàticament el radar.', error)
      }
    }

    updateFromRadar()

    const intervalId = window.setInterval(updateFromRadar, autoRefreshIntervalMs)

    return () => {
      isCancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  const allStories = [...liveStories, ...validSeedArticles]
  const { activeStories, archiveStories } = splitEditionStories(allStories)
  const normalizedQuery = searchTerm.trim().toLowerCase()
  const activeDistanceOption =
    distanceFilterOptions.find((option) => option.id === activeDistanceFilter) ??
    distanceFilterOptions[0]
  const distanceFilteredStories = activeStories.filter(
    (story) => getDistanceBand(story).rank <= activeDistanceOption.maxRank,
  )

  const matchesFilters = (story) => {
    const matchesCategory =
      activeCategory === 'Totes' ||
      getStorySection(story).label === activeCategory
    const searchableContent = [
      getStorySection(story).label,
      story.title,
      story.summary,
      story.location,
      story.impact,
      story.source,
      story.kicker,
    ]
      .join(' ')
      .toLowerCase()

    return matchesCategory && searchableContent.includes(normalizedQuery)
  }
  const withinDistance = (story) =>
    getDistanceBand(story).rank <= activeDistanceOption.maxRank

  let filteredStories = distanceFilteredStories.filter(matchesFilters)
  // Cap secció no pot quedar buida mai. Si has triat una SECCIÓ concreta i avui
  // no té cap notícia recent, la completem amb l'hemeroteca (les més noves
  // d'aquell tema). Si ni amb la proximitat triada n'hi ha, la relaxem com a
  // últim recurs. Així clicar "Ciència", "Salut"… sempre ensenya alguna cosa.
  let sectionFromArchive = false
  let sectionShowingGeneral = false
  if (activeCategory !== 'Totes' && filteredStories.length === 0) {
    const archiveSorted = [...archiveStories].sort(sortByPublishedAtDesc)
    const rescueWithDistance = archiveSorted.filter(
      (story) => withinDistance(story) && matchesFilters(story),
    )
    const rescue = rescueWithDistance.length
      ? rescueWithDistance
      : archiveSorted.filter(matchesFilters)
    if (rescue.length > 0) {
      filteredStories = rescue
      sectionFromArchive = true
    } else if (normalizedQuery === '') {
      // Últim recurs: la secció no té CAP notícia (ni recent ni a l'hemeroteca,
      // p. ex. una secció temàtica un dia fluix). Per no deixar mai una pàgina morta,
      // ensenyem les bones notícies del dia amb un avís ben clar.
      const general = [...activeStories].sort(sortByDistanceAndDate)
      if (general.length > 0) {
        filteredStories = general
        sectionShowingGeneral = true
      }
    }
  }

  const nearestAvailableBand = filteredStories[0]
    ? getDistanceBand(filteredStories[0])
    : null

  const featuredStory =
    filteredStories.find(
      (story) =>
        story.featured &&
        getDistanceBand(story).rank === nearestAvailableBand?.rank,
    ) ??
    filteredStories[0] ??
    null

  const shouldShowFeaturedInResults =
    activeCategory !== 'Totes' || normalizedQuery !== ''
  const remainingStories = filteredStories.filter(
    (story) => shouldShowFeaturedInResults || story.id !== featuredStory?.id,
  )
  const sectionGroups = getSectionGroups(
    filteredStories,
    remainingStories,
    featuredStory,
  )
  // Portada "a cop d'ull": totes les notícies del dia en una sola graella,
  // ordenades per proximitat i recència, sense haver d'anar secció per secció.
  // (Cada targeta ja porta la seva etiqueta de secció, així el lector s'hi ubica.)
  const portadaStories = [...remainingStories].sort(sortByDistanceAndDate)
  const currentStory =
    route.page === 'story'
      ? allStories.find((story) => story.id === route.storyId)
      : null

  const featuredSourceLink = featuredStory ? getSourceLink(featuredStory) : null
  const featuredImageLink = featuredStory
    ? getImageLink(featuredStory, featuredSourceLink)
    : ''
  const currentStorySourceLink = currentStory ? getSourceLink(currentStory) : null
  const currentStoryImageLink = currentStory
    ? getImageLink(currentStory, currentStorySourceLink)
    : ''
  const relatedStories = currentStory
    ? allStories
        .filter(
          (story) =>
            story.id !== currentStory.id &&
            (getStorySection(story).id === getStorySection(currentStory).id ||
              story.origin === currentStory.origin),
        )
        .sort(sortByDistanceAndDate)
        .slice(0, 3)
    : []
  const categories = [
    'Totes',
    ...editorialSections.map((section) => section.label),
  ]
  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    activeCategory !== 'Totes' ||
    activeDistanceFilter !== 'progressiu'
  const visibleSectionIds = new Set(sectionGroups.map((section) => section.id))
  const headlineCount = filteredStories.filter((story) =>
    visibleSectionIds.has(getStorySection(story).id),
  ).length
  const lastRefreshLabel = formatDateTime(lastRefreshAt)

  useEffect(() => {
    let nextTitle = `${siteName} | Bones notícies`
    let nextDescription = defaultDescription
    let nextType = 'website'
    let nextImage = `${siteUrl}/og-image.svg`

    if (route.page === 'manifest') {
      nextTitle = `Manifest | ${siteName}`
      nextDescription =
        "La línia editorial d'El Bon Diari: criteri, utilitat i periodisme constructiu."
    } else if (route.page === 'archive') {
      nextTitle = `Hemeroteca | ${siteName}`
      nextDescription =
        "La Hemeroteca d'El Bon Diari conserva les bones notícies que ja han passat per portada."
    } else if (route.page === 'story' && currentStory) {
      nextTitle = `${currentStory.title} | ${siteName}`
      nextDescription = currentStory.summary || currentStory.impact
      nextType = 'article'
      nextImage = currentStory.imageUrl?.startsWith('http')
        ? currentStory.imageUrl
        : `${siteUrl}${currentStory.imageUrl}`
    } else if (route.page === 'story') {
      nextTitle = `Pàgina no trobada | ${siteName}`
    } else if (route.page === 'stats') {
      nextTitle = `Estadístiques | ${siteName}`
      nextDescription =
        "Panell d'estadístiques d'El Bon Diari: visites, pàgines més llegides i orígens."
    } else if (route.page === 'about') {
      nextTitle = `Sobre · ${siteName}`
      nextDescription =
        "Qui hi ha darrere d'El Bon Diari, criteri editorial, política de privacitat i llicència del contingut."
    } else if (route.page === 'privacy') {
      nextTitle = `Política de privacitat · ${siteName}`
      nextDescription =
        "Política de privacitat d'El Bon Diari: quines dades es recullen al web i a l'app, notificacions push, butlletí i els teus drets."
    } else if (route.page === 'saved') {
      nextTitle = `Desats · ${siteName}`
      nextDescription =
        'Els articles que has desat per llegir després, guardats al teu dispositiu i disponibles fins i tot sense connexió.'
    } else if (route.page === 'home' && activeCategory !== 'Totes') {
      nextTitle = `${activeCategory} | ${siteName}`
      nextDescription = `Bones notícies de la secció ${activeCategory}, filtrades amb criteri editorial i proximitat.`
    }

    document.title = nextTitle
    setCanonicalLink(getCanonicalUrl(currentPath, route))

    setHeadMeta('meta[name="description"]', { name: 'description' }, nextDescription)
    setHeadMeta('meta[property="og:type"]', { property: 'og:type' }, nextType)
    setHeadMeta('meta[property="og:title"]', { property: 'og:title' }, nextTitle)
    setHeadMeta(
      'meta[property="og:description"]',
      { property: 'og:description' },
      nextDescription,
    )
    setHeadMeta(
      'meta[property="og:url"]',
      { property: 'og:url' },
      getCanonicalUrl(currentPath, route),
    )
    setHeadMeta('meta[property="og:image"]', { property: 'og:image' }, nextImage)
    setHeadMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, nextTitle)
    setHeadMeta(
      'meta[name="twitter:description"]',
      { name: 'twitter:description' },
      nextDescription,
    )
    setHeadMeta('meta[name="twitter:image"]', { name: 'twitter:image' }, nextImage)

    let robotsTag = document.querySelector('meta[name="robots"]')

    if (route.page === 'stats') {
      if (!robotsTag) {
        robotsTag = document.createElement('meta')
        robotsTag.setAttribute('name', 'robots')
        document.head.appendChild(robotsTag)
      }

      robotsTag.setAttribute('content', 'noindex, nofollow')
    } else if (robotsTag?.getAttribute('content') === 'noindex, nofollow') {
      robotsTag.remove()
    }
  }, [activeCategory, currentPath, currentStory, route])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hostname === 'localhost') return
    if (currentPath.startsWith('/estadistiques')) return

    try {
      if (window.localStorage.getItem('bondiari-owner') === '1') return
    } catch {
      // localStorage no disponible: continuem comptant
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      fetch('/api/track-visit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: currentPath,
          referrer: document.referrer || '',
          viewport: window.innerWidth || 0,
        }),
        signal: controller.signal,
        keepalive: true,
      }).catch(() => {})
    }, 800)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [currentPath])

  function navigate(path, { replace = false, scroll = true } = {}) {
    const nextPath = normalizePath(path)
    const method = replace ? 'replaceState' : 'pushState'

    const commit = () => {
      window.history[method]({}, '', nextPath)
      setCurrentPath(nextPath)
    }

    // Transició nativa entre pàgines (View Transitions API). Només quan canvia
    // de PÀGINA de debò (no en filtrar la portada, que només canvia la query) i
    // si l'usuari no ha demanat menys moviment. On no hi ha suport, navega sec.
    const pagePath = (p) => normalizePath(p).split('?')[0]
    const changesPage = pagePath(nextPath) !== pagePath(currentPath)
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (
      changesPage &&
      !prefersReducedMotion &&
      typeof document !== 'undefined' &&
      document.startViewTransition
    ) {
      document.startViewTransition(() => flushSync(commit))
    } else {
      commit()
    }

    if (scroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // Refresc lleuger per al gest "estira per actualitzar": refà el radar i
  // fusiona sense navegar ni tocar filtres (a diferència de handleRefresh).
  async function refreshRadar() {
    try {
      const payload = await fetchLivePositiveNewsPayload({ force: true })
      setLiveStories((currentStories) =>
        mergeLiveStories(currentStories, payload.stories).stories,
      )
      const updatedAt = payload.updatedAt || new Date().toISOString()
      const nextAt =
        payload.nextRefreshAt ||
        new Date(Date.now() + autoRefreshIntervalMs).toISOString()
      setLastRefreshAt(updatedAt)
      setNextRefreshAt(nextAt)
      saveRefreshMetadata(updatedAt, nextAt)
    } catch (error) {
      console.warn('No s’ha pogut actualitzar amb el gest de tibada.', error)
    }
  }

  function resetFilters({ syncUrl = true, scroll = false } = {}) {
    setSearchTerm('')
    setActiveCategory('Totes')
    setActiveDistanceFilter('progressiu')

    if (syncUrl && route.page === 'home') {
      navigate('/', { replace: true, scroll })
    }
  }

  function applyCategoryFilter(category, event) {
    if (!canInterceptNavigation(event)) {
      return
    }

    event.preventDefault()
    setActiveCategory(category)
    navigate(
      getFilterPath({
        category,
        distanceFilter: activeDistanceFilter,
        search: searchTerm,
      }),
      { scroll: false },
    )

    if (typeof window !== 'undefined' && category !== 'Totes') {
      const sectionId = getCategorySlug(category)
      window.setTimeout(() => {
        const target = document.getElementById(`seccio-${sectionId}`)
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 120)
    }
  }

  function applyDistanceFilter(distanceFilter, event) {
    if (!canInterceptNavigation(event)) {
      return
    }

    event.preventDefault()
    setActiveDistanceFilter(distanceFilter)
    navigate(
      getFilterPath({
        category: activeCategory,
        distanceFilter,
        search: searchTerm,
      }),
      { scroll: false },
    )
  }

  async function handleRefresh() {
    setIsRefreshing(true)

    try {
      const payload = await fetchLivePositiveNewsPayload({ force: true })

      setLiveStories((currentStories) =>
        mergeLiveStories(currentStories, payload.stories).stories,
      )

      const updatedAt = payload.updatedAt || new Date().toISOString()
      const nextAt =
        payload.nextRefreshAt ||
        new Date(Date.now() + autoRefreshIntervalMs).toISOString()

      setLastRefreshAt(updatedAt)
      setNextRefreshAt(nextAt)
      saveRefreshMetadata(updatedAt, nextAt)

      resetFilters({ syncUrl: false })
      navigate('/', { replace: route.page === 'home', scroll: true })
    } catch (err) {
      console.error('Error xarxa en viu', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contingut">
        Saltar al contingut
      </a>
      <PullToRefresh onRefresh={refreshRadar}>
      <div className="page-shell">
        <SiteHeader
          currentPage={route.page}
          isRefreshing={isRefreshing}
          onNavigate={navigate}
          onRefresh={handleRefresh}
        />

        <main id="contingut" className="site-main">
        {route.page === 'story' ? (
          currentStory ? (
            <StoryPage
              story={currentStory}
              sourceLink={currentStorySourceLink}
              imageLink={currentStoryImageLink}
              relatedStories={relatedStories}
              onNavigate={navigate}
            />
          ) : (
            <NotFoundPage onNavigate={navigate} />
          )
        ) : null}

        {route.page === 'archive' ? (
          <ArchivePage
            archiveStories={archiveStories}
            lastRefreshLabel={lastRefreshLabel}
            onNavigate={navigate}
          />
        ) : null}

        {route.page === 'home' ? (
          <>
            <h1 className="sr-only">
              El Bon Diari: bones notícies verificables
            </h1>
            <section className="topics-bar" aria-label="Temes">
              <p className="section-tag">Temes</p>
              <div className="category-row">
                {categories.map((category) => (
                  <a
                    key={`top-${category}`}
                    className={`category-pill ${
                      activeCategory === category ? 'is-active' : ''
                    }`}
                    href={getFilterPath({
                      category,
                      distanceFilter: activeDistanceFilter,
                      search: searchTerm,
                    })}
                    aria-current={
                      activeCategory === category ? 'true' : undefined
                    }
                    onClick={(event) => applyCategoryFilter(category, event)}
                  >
                    {category}
                  </a>
                ))}
              </div>
            </section>
            <section className="hero-grid">
              {featuredStory ? (
                <article className="featured-story">
                  <div className="featured-story__media">
                    <a
                      className="story-image-link"
                      href={featuredImageLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        className="featured-story__image"
                        src={featuredStory.imageUrl}
                        alt={featuredStory.imageAlt}
                        onError={handleImageError}
                      />
                    </a>
                  </div>

                  <div className="featured-story__content">
                    <div className="featured-story__header">
                      <span className="paper-chip paper-chip--light">
                        {getStorySection(featuredStory).label}
                      </span>
                      <span className="paper-chip paper-chip--subtle">
                        {getDistanceBand(featuredStory).label}
                      </span>
                      {featuredStory.origin !== 'editorial' ? (
                        <span className="paper-chip paper-chip--subtle">
                          {getOriginLabel(featuredStory.origin)}
                        </span>
                      ) : null}
                    </div>

                    <p className="featured-story__kicker">
                      {featuredStory.kicker}
                    </p>
                    <h2>{featuredStory.title}</h2>
                    <p className="featured-story__summary">
                      {featuredStory.summary || featuredStory.impact}
                    </p>
                  </div>

                  <div className="featured-story__footer">
                    <div className="featured-story__impact">
                      <span>Impacte</span>
                      <strong>{featuredStory.impact}</strong>
                    </div>

                    <div className="featured-story__meta">
                      <span>{featuredStory.location}</span>
                      <span>{formatDate(featuredStory.publishedAt)}</span>
                      <span>{featuredStory.readTime}</span>
                    </div>

                    <div className="featured-story__source">
                      <span>Font</span>
                      <a
                        href={featuredSourceLink.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {featuredStory.source}
                      </a>
                    </div>

                    {featuredStory.imageCredit ? (
                      <p className="image-credit image-credit--light">
                        {featuredStory.imageCredit}
                      </p>
                    ) : null}

                    <a
                      className="button button--light"
                      href={getStoryPath(featuredStory.id)}
                      onClick={(event) => {
                        if (!canInterceptNavigation(event)) {
                          return
                        }

                        event.preventDefault()
                        navigate(getStoryPath(featuredStory.id))
                      }}
                    >
                      Obrir la peça completa
                    </a>
                  </div>
                </article>
              ) : (
                <article className="featured-story featured-story--empty">
                  <p className="section-tag">Portada sense coincidències</p>
                  <h2>Cap peça encaixa amb els filtres actuals.</h2>
                  <p className="featured-story__summary">
                    Torna al radar progressiu o obre el mapa geogràfic perquè la
                    portada recuperi la selecció editorial completa.
                  </p>
                  <button
                    className="button button--primary"
                    type="button"
                    onClick={resetFilters}
                  >
                    Recuperar la portada
                  </button>
                </article>
              )}

            </section>

            <NewsletterForm variant="compact" />

            <section className="section-block">
              <div className="section-heading">
                <div>
                  <p className="section-tag">Portada viva</p>
                  <h2 className="sr-only">Portada viva</h2>
                </div>
                <p className="section-caption">
                  {sectionShowingGeneral
                    ? 'Aquesta secció encara no té notícies pròpies avui; mentrestant, aquí tens les bones notícies del dia.'
                    : sectionFromArchive
                    ? 'Aquesta secció no té novetats recents: et mostrem les últimes de l’hemeroteca.'
                    : headlineCount > 0
                    ? `Mostrant ${headlineCount} bones notícies a l’edició actual.`
                    : 'Cap història coincideix amb aquest filtre ara mateix.'}
                  <a
                    className="section-caption__link"
                    href="/hemeroteca"
                    onClick={(event) => {
                      if (!canInterceptNavigation(event)) {
                        return
                      }

                      event.preventDefault()
                      navigate('/hemeroteca')
                    }}
                  >
                    Anar a la Hemeroteca
                  </a>
                </p>
              </div>

              <div className="control-strip">
                <label className="search-field" htmlFor="story-search">
                  <span>Cerca per lloc, tema o impacte</span>
                  <input
                    id="story-search"
                    name="story-search"
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Ex. biblioteca, energia, barri..."
                  />
                </label>

                {hasActiveFilters ? (
                  <button
                    className="link-button"
                    type="button"
                    onClick={resetFilters}
                  >
                    Netejar filtres
                  </button>
                ) : null}
              </div>

              <div
                className="distance-row"
                aria-label="Filtres per proximitat respecte de Catalunya"
              >
                {distanceFilterOptions.map((option) => (
                  <a
                    key={option.id}
                    className={`distance-pill ${
                      activeDistanceFilter === option.id ? 'is-active' : ''
                    }`}
                    href={getFilterPath({
                      category: activeCategory,
                      distanceFilter: option.id,
                      search: searchTerm,
                    })}
                    aria-current={
                      activeDistanceFilter === option.id ? 'true' : undefined
                    }
                    onClick={(event) => applyDistanceFilter(option.id, event)}
                  >
                    {option.label}
                  </a>
                ))}
              </div>

              <p className="distance-note">
                <strong>{activeDistanceOption.label}.</strong>{' '}
                {activeDistanceOption.description}
              </p>

              <MostReadSection allStories={allStories} onNavigate={navigate} />

              {portadaStories.length > 0 ? (
                <div className="news-grid news-grid--portada">
                  {portadaStories.map((story) => (
                    <StoryCard
                      key={story.id}
                      story={story}
                      onNavigate={navigate}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <h3>No n’hi ha més per aquest filtre.</h3>
                  <p>
                    {headlineCount > 0
                      ? 'La peça destacada és l’única que encaixa amb aquesta cerca. Pots llegir-la o provar una altra categoria.'
                      : 'Prova amb una paraula diferent o torna a “Totes” per recuperar la portada completa.'}
                  </p>
                </div>
              )}
            </section>
            <EditorialCounter />
            <NewsletterForm />
            <PushOptIn />
          </>
        ) : null}

        {route.page === 'manifest' ? (
          <>
            <PageHero
              tag="Manifest editorial"
              title="Una web de bones notícies necessita criteri, no només to positiu."
              description="Aquest és el marc amb què El Bon Diari decideix què entra a portada, com s’explica i quin valor ha de tenir per a qui ho llegeix."
            />
            <ManifestSection />
            <SourcesManifest />
          </>
        ) : null}

        {route.page === 'stats' ? <StatsPage allStories={allStories} /> : null}

        {route.page === 'about' ? <AboutPage onNavigate={navigate} /> : null}

        {route.page === 'privacy' ? <PrivacyPage onNavigate={navigate} /> : null}

        {route.page === 'saved' ? <SavedPage onNavigate={navigate} /> : null}
        </main>

        <FooterNote onNavigate={navigate} />
      </div>
      </PullToRefresh>
    </div>
  )
}

export default App
