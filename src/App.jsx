import { useEffect, useState, lazy, Suspense } from 'react'
import { flushSync } from 'react-dom'
import './App.css'
import './styles/professional-shell.css'
import {
  fetchEditorialArchivePayload,
  fetchLivePositiveNewsPayload,
  fetchLiveTicker,
} from './api/rssFeed'
import { LIVE_EDITORIAL_VERSION } from './lib/editorial-version.js'
import { feedStoryId } from './lib/story-id.js'
import NotFoundPage from './components/NotFoundPage.jsx'
import PullToRefresh from './components/PullToRefresh.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { getStoryPath } from './lib/navigation.js'
import {
  DEFAULT_STORY_IMAGE,
  classifyImage,
  hasOriginalPhoto,
} from './lib/imageRules'
import {
  distanceFilterOptions,
  defaultDistanceFilter,
  getDistanceBand,
  selectGeographicRescue,
} from './lib/distance.js'
import {
  editorialSections,
  serviceSectionIds,
  getStorySection,
} from './lib/sections.js'
import {
  EDITORIAL_TOPIC_INDEX,
  getEditorialTopicBySlug,
  getEditorialTopicSlug,
  classifyAllowedEditorialTopic,
} from './lib/category.js'
import { formatDateTime } from './lib/viewHelpers.js'

import PortadaView from './views/PortadaView.jsx'
import StoryDetailView from './views/StoryDetailView.jsx'
import SiteHeader from './components/SiteHeader.jsx'
import SiteFooter from './components/SiteFooter.jsx'
import { AccessibilityControls } from './components/AccessibilityControls.jsx'

const ArchiveView = lazy(() => import('./views/ArchiveView.jsx'))
const TopicsView = lazy(() => import('./views/TopicsView.jsx'))
const TopicPageView = lazy(() => import('./views/TopicPageView.jsx'))
const SavedView = lazy(() => import('./views/SavedView.jsx'))
const StatsView = lazy(() => import('./views/StatsView.jsx'))
const PrivacyView = lazy(() => import('./views/PrivacyView.jsx'))
const ManifestView = lazy(() => import('./views/ManifestView.jsx'))
const AboutView = lazy(() => import('./views/AboutView.jsx'))
const DiagnosticView = lazy(() => import('./views/DiagnosticView.jsx'))

const siteName = 'El Bon Diari'
const siteUrl = 'https://bondiari.com'
const defaultDescription =
  "Periodisme constructiu en català: solucions, verificacions i informació útil amb fonts transparents."
const refreshStorageKey = 'bon-diari-last-refresh-at-v4'
const nextRefreshStorageKey = 'bon-diari-next-refresh-at-v4'
const defaultStoryImage = DEFAULT_STORY_IMAGE
const currentLiveEditorialVersion = LIVE_EDITORIAL_VERSION
const autoRefreshIntervalMs = 1 * 60 * 60 * 1000
const liveTickerIntervalMs = 2 * 60 * 1000
// Portada: fins a 5 dies d'antiguitat i un màxim de 25 peces (25-07-2026).
// La resta passa a l'Hemeroteca. Només els formats de servei (verificacions,
// dades i ajuts vigents) tenen finestres pròpies més llargues.
const activeEditionMaxAgeMs = 5 * 24 * 60 * 60 * 1000
const featuredStoryMaxAgeMs = 14 * 24 * 60 * 60 * 1000
const activeEditionMaxStories = 25
// L'edició del dia NO es completa mai amb articles vells. Si el radar porta
// poques peces, la portada surt curta: val més un diari breu i d'avui que un
// diari ple d'articles de fa setmanes. L'Hemeroteca segueix sent accessible
// com a secció pròpia (/hemeroteca), amb la data original ben visible.
const serviceEditionFormats = new Set(['verification', 'data', 'opportunity'])
const maxStoredFeedStories = 40

const seedArticlesPromise = import('./data/articles.js').then((m) =>
  m.seedArticles.map((story) => normalizeStory(story)).filter(Boolean),
)

function normalizePathname(pathname) {
  const cleanPathname = pathname || '/'
  if (cleanPathname.length > 1 && cleanPathname.endsWith('/')) {
    return cleanPathname.slice(0, -1)
  }
  return cleanPathname
}

function splitAppPath(path) {
  const [pathname = '/', search = ''] = String(path || '/').split('?')
  return {
    pathname: normalizePathname(pathname),
    search: search ? `?${search}` : '',
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

  if (normalizedPath === '/temes') {
    return { page: 'topics' }
  }

  if (normalizedPath.startsWith('/tema/')) {
    return {
      page: 'topic',
      topicSlug: decodeURIComponent(normalizedPath.replace('/tema/', '')),
    }
  }

  if (normalizedPath === '/estadistiques') {
    return { page: 'stats' }
  }

  if (normalizedPath === '/diagnostic' || normalizedPath === '/diagnosi') {
    return { page: 'diagnostic' }
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

function getCategorySlug(category) {
  if (category === 'Totes') {
    return ''
  }
  return (
    getEditorialTopicSlug(category) ||
    editorialSections.find((section) => section.label === category)?.id ||
    ''
  )
}

function getCategoryFromSlug(slug) {
  if (!slug) {
    return 'Totes'
  }
  return (
    getEditorialTopicBySlug(slug)?.label ||
    (editorialSections.find((section) => section.id === slug)?.label ?? 'Totes')
  )
}

function getDistanceFilterFromSlug(slug) {
  return (
    distanceFilterOptions.find((option) => option.id === slug)?.id ??
    defaultDistanceFilter
  )
}

function getFilterStateFromPath(path) {
  const params = getSearchParamsFromPath(path)
  return {
    category: getCategoryFromSlug(params.get('seccio') || params.get('tema')),
    distanceFilter: getDistanceFilterFromSlug(
      params.get('distancia') || params.get('abast'),
    ),
    search: params.get('cerca') || '',
  }
}

function getFilterPath({
  category = 'Totes',
  distanceFilter = defaultDistanceFilter,
  search = '',
}) {
  const params = new URLSearchParams()
  const categorySlug = getCategorySlug(category)

  if (categorySlug) {
    params.set('seccio', categorySlug)
  }

  if (distanceFilter !== defaultDistanceFilter) {
    params.set('distancia', distanceFilter)
  }

  if (search.trim()) {
    params.set('cerca', search.trim())
  }

  const queryString = params.toString()
  return queryString ? `/?${queryString}` : '/'
}

function getCanonicalUrl(path, route) {
  if (route.page === 'story' && route.storyId) {
    return `${siteUrl}${getStoryPath(route.storyId)}`
  }

  const pathname = getPathnameFromPath(path)
  const filterState = getFilterStateFromPath(path)
  const canonicalQuery = getFilterPath({
    category: filterState.category,
    distanceFilter: filterState.distanceFilter,
  })

  if (pathname === '/') {
    return `${siteUrl}${canonicalQuery}`
  }

  return `${siteUrl}${pathname}`
}

function setHeadMeta(selector, createAttributes, content) {
  let element = document.querySelector(selector)

  if (!element) {
    element = document.createElement('meta')
    for (const [key, value] of Object.entries(createAttributes)) {
      element.setAttribute(key, value)
    }
    document.head.appendChild(element)
  }

  element.setAttribute('content', content)
}

function setCanonicalLink(href) {
  let element = document.querySelector('link[rel="canonical"]')

  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', 'canonical')
    document.head.appendChild(element)
  }

  element.setAttribute('href', href)
}

function normalizeStory(story) {
  if (!story || !story.title) {
    return null
  }

  const rawUrl = story.url || ''
  const isDemoSourceUrl = rawUrl.includes('/source.html?story=')
  const storyId = story.id || feedStoryId(rawUrl || story.title)
  const ownContent = Boolean(
    story.ownContent ||
      (Array.isArray(story.body) && story.body.length > 0) ||
      (story.origin !== 'feed' && !isDemoSourceUrl),
  )

  const resolvedImageUrl =
    story.imageUrl || defaultStoryImage

  const imageAnalysis = classifyImage(resolvedImageUrl)
  const hasPhoto = hasOriginalPhoto({
    ...story,
    imageUrl: resolvedImageUrl,
    imageAlt: story.imageAlt,
    imageCredit: story.imageCredit,
  })

  return {
    ...story,
    id: storyId,
    editorialVersion:
      story.editorialVersion || currentLiveEditorialVersion,
    kicker: story.kicker || 'Diari de Bones Notícies',
    location: story.location || 'Catalunya',
    origin: story.origin || 'editorial',
    sourceTier: story.sourceTier || 'B',
    readTime:
      story.readTime || estimateReadTime(story.summary, story.impact),
    imageUrl: resolvedImageUrl,
    imageAlt:
      story.imageAlt || `Il·lustració editorial per a ${story.title}.`,
    imageCredit: story.imageCredit || 'El Bon Diari',
    imageCategory: imageAnalysis.category,
    imageFlags: imageAnalysis.flags,
    hasOriginalPhoto: hasPhoto,
    publishedAt: story.publishedAt || new Date().toISOString(),
    body: Array.isArray(story.body) ? story.body : [],
    ownContent,
  }
}

function loadStoredTimestamp(key) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const time = new Date(raw).getTime()
    return Number.isNaN(time) ? null : raw
  } catch {
    return null
  }
}

function saveRefreshMetadata(updatedAt, nextRefreshAt) {
  if (typeof window === 'undefined') return
  try {
    if (updatedAt) window.localStorage.setItem(refreshStorageKey, updatedAt)
    if (nextRefreshAt) window.localStorage.setItem(nextRefreshStorageKey, nextRefreshAt)
  } catch {
    // Si el navegador no deixa escriure, la web continua funcionant igual.
  }
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

function createFeedStory(story) {
  const now = new Date()
  const rawUrl = story.url || ''
  const isDemoSourceUrl = rawUrl.includes('/source.html?story=')

  return normalizeStory({
    ...story,
    id: story.id || feedStoryId(rawUrl || story.title),
    origin: story.origin || 'feed',
    publishedAt: story.publishedAt || now.toISOString(),
    sourceTier: story.sourceTier || 'B',
    ownContent: Boolean(
      story.ownContent ||
        (Array.isArray(story.body) && story.body.length > 0) ||
        !isDemoSourceUrl,
    ),
  })
}

function getStoryTimestamp(story) {
  const time = new Date(story.publishedAt).getTime()
  return Number.isNaN(time) ? 0 : time
}

function sortByPublishedAtDesc(leftStory, rightStory) {
  return getStoryTimestamp(rightStory) - getStoryTimestamp(leftStory)
}

function normalizeStoryTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function getStoryKey(story) {
  const normalizedTitle = normalizeStoryTitle(story.title)
  if (normalizedTitle.length >= 12) {
    return `title:${normalizedTitle}`
  }
  return `url:${story.url || story.id}`
}

function mergeLiveStories(currentStories, liveArticles, seedStories = []) {
  const now = Date.now()
  const currentById = new Map(currentStories.map((story) => [story.id, story]))
  const seedKeys = new Set(seedStories.map(getStoryKey))

  const newLiveStories = []

  for (const rawArticle of liveArticles) {
    const freshStory = createFeedStory(rawArticle)
    if (!freshStory) continue

    const storyKey = getStoryKey(freshStory)

    if (seedKeys.has(storyKey)) {
      continue
    }

    const existingStory = currentById.get(freshStory.id)

    if (existingStory) {
      currentById.set(freshStory.id, {
        ...existingStory,
        ...freshStory,
        isFresh: false,
      })
    } else {
      currentById.set(freshStory.id, {
        ...freshStory,
        isFresh: true,
      })
      newLiveStories.push(freshStory)
    }
  }

  const mergedStories = [...currentById.values()]
    .filter((story) => {
      const storyAge = now - getStoryTimestamp(story)
      // Mateixa finestra que l'edició (5 dies): si aquí es podava abans, una
      // peça del cinquè dia desapareixia del navegador tot i ser encara vigent.
      return (
        serviceEditionFormats.has(story.editorialFormat) ||
        storyAge <= activeEditionMaxAgeMs
      )
    })
    .sort(sortByPublishedAtDesc)
    .slice(0, maxStoredFeedStories)

  return {
    stories: mergedStories,
    newCount: newLiveStories.length,
  }
}

function mergeStoryCatalogs(...catalogs) {
  const storiesById = new Map()

  for (const stories of catalogs) {
    for (const story of stories || []) {
      if (!story?.id) continue
      const previous = storiesById.get(story.id)
      storiesById.set(story.id, previous ? { ...previous, ...story } : story)
    }
  }

  return [...storiesById.values()].sort(sortByPublishedAtDesc)
}

function splitEditionStories(stories) {
  const now = Date.now()

  // L'edat mana per a TOTHOM, també per a les peces editorials de llavor:
  // l'antiga porta del darrere (origin === 'editorial') mantenia articles de
  // mesos enrere a la portada. Només els formats de servei conserven les
  // seves finestres llargues (el servidor ja les poda al seu termini).
  const candidates = stories.filter(
    (story) =>
      serviceEditionFormats.has(story.editorialFormat) ||
      now - getStoryTimestamp(story) <= activeEditionMaxAgeMs,
  )

  // L'hemeroteca no es barreja mai amb l'edició activa. Abans, quan hi havia
  // poques peces recents, aquesta funció omplia fins a sis posicions amb
  // articles antics i una d'elles podia acabar com a destacada.
  const activeStories = [...candidates]
    .sort(sortByPublishedAtDesc)
    .slice(0, activeEditionMaxStories)

  const recentIds = new Set(candidates.map((story) => story.id))

  const archiveStories = stories
    .filter((story) => !recentIds.has(story.id))
    .sort(sortByPublishedAtDesc)

  return {
    activeStories,
    archiveStories,
  }
}

function App() {
  const initialFilterState = getFilterStateFromPath(getCurrentPath())
  const [liveStories, setLiveStories] = useState([])
  const [storedStories, setStoredStories] = useState([])
  const [seedStories, setSeedStories] = useState([])
  const [fetchedStory, setFetchedStory] = useState(null)
  const [isFetchingStory, setIsFetchingStory] = useState(
    () => getRoute(getCurrentPath()).page === 'story',
  )
  const [liveTicker, setLiveTicker] = useState([])
  const [editionReferenceTime] = useState(() => Date.now())
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

function waitForSwController() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null)
  }
  if (navigator.serviceWorker.controller) {
    return Promise.resolve(navigator.serviceWorker.controller)
  }
  return new Promise((resolve) => {
    let resolved = false
    const onControllerChange = () => {
      if (resolved) return
      resolved = true
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      resolve(navigator.serviceWorker.controller)
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    navigator.serviceWorker.ready
      .then(() => {
        if (navigator.serviceWorker.controller && !resolved) {
          resolved = true
          navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
          resolve(navigator.serviceWorker.controller)
        }
      })
      .catch(() => {})

    setTimeout(() => {
      if (!resolved) {
        resolved = true
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
        resolve(navigator.serviceWorker.controller)
      }
    }, 3000)
  })
}

  // Pre-carrega en segon pla (idle) dels chunks diferits quan el Service Worker
  // ha pres el control del client (controllerchange / controller active)
  // per garantir que queden desats a CacheStorage offline.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const prefetch = async () => {
      try {
        await waitForSwController()
        await Promise.allSettled([
          import('./views/ArchiveView.jsx'),
          import('./views/TopicsView.jsx'),
          import('./views/SavedView.jsx'),
          import('./views/StatsView.jsx'),
          import('./views/PrivacyView.jsx'),
          import('./views/ManifestView.jsx'),
          import('./views/AboutView.jsx'),
          import('./views/DiagnosticView.jsx'),
        ])
      } catch {
        // Ignorar fallades en offline inicial
      }
    }
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(prefetch)
    } else {
      window.setTimeout(prefetch, 2500)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    fetchEditorialArchivePayload()
      .then((payload) => {
        if (isCancelled) return
        setStoredStories(
          payload.stories.map((story) => createFeedStory(story)).filter(Boolean),
        )
      })
      .catch((error) => {
        console.warn('No s’ha pogut carregar l’hemeroteca permanent.', error)
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    seedArticlesPromise
      .then((articles) => {
        if (!isCancelled) setSeedStories(articles)
      })
      .catch((error) => {
        console.warn('No s’ha pogut carregar el catàleg editorial.', error)
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      const nextPath = getCurrentPath()
      setCurrentPath(nextPath)
      if (getRoute(nextPath).page === 'home') {
        const nextFilters = getFilterStateFromPath(nextPath)
        setSearchTerm(nextFilters.search)
        setActiveCategory(nextFilters.category)
        setActiveDistanceFilter(nextFilters.distanceFilter)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    let isCancelled = false

    async function updateFromRadar() {
      try {
        const [payload, editorialStories] = await Promise.all([
          fetchLivePositiveNewsPayload(),
          seedArticlesPromise,
        ])

        if (isCancelled) {
          return
        }

        setLiveStories((currentStories) =>
          mergeLiveStories(currentStories, payload.stories, editorialStories)
            .stories,
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

  useEffect(() => {
    let isCancelled = false

    async function updateTicker() {
      try {
        const { items } = await fetchLiveTicker()
        if (!isCancelled) setLiveTicker(items)
      } catch (error) {
        console.warn('No s’ha pogut actualitzar el directe.', error)
      }
    }

    updateTicker()
    const tickerId = window.setInterval(updateTicker, liveTickerIntervalMs)

    return () => {
      isCancelled = true
      window.clearInterval(tickerId)
    }
  }, [])

  useEffect(() => {
    if (route.page !== 'story' || !route.storyId) {
      return undefined
    }
    const inMemory =
      liveStories.some((story) => story.id === route.storyId) ||
      storedStories.some((story) => story.id === route.storyId) ||
      seedStories.some((story) => story.id === route.storyId) ||
      fetchedStory?.id === route.storyId
    if (inMemory) {
      return undefined
    }

    let cancelled = false
    ;(async () => {
      setIsFetchingStory(true)
      try {
        const response = await fetch(
          `/api/story/${encodeURIComponent(route.storyId)}`,
        )
        if (!response.ok) return
        const data = await response.json()
        if (cancelled || !data?.story) return
        const normalized =
          createFeedStory(data.story) ||
          normalizeStory({
            ...data.story,
            id: route.storyId,
            origin: data.story.origin || 'feed',
            publishedAt: data.story.publishedAt || new Date().toISOString(),
          })
        if (normalized) setFetchedStory(normalized)
      } catch {
        // Fallback a 404
      } finally {
        if (!cancelled) setIsFetchingStory(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    route.page,
    route.storyId,
    liveStories,
    storedStories,
    seedStories,
    fetchedStory?.id,
  ])

  const allStories = mergeStoryCatalogs(seedStories, storedStories, liveStories)
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
  let filteredStories = distanceFilteredStories.filter(matchesFilters)
  let sectionShowingGeneral = false
  const activeSection = editorialSections.find(
    (section) => section.label === activeCategory,
  )
  const isServiceSection = serviceSectionIds.has(activeSection?.id)
  // Una secció sense novetats ja NO es rescata de l'hemeroteca: això treia a
  // portada peces de fa setmanes. Si no hi ha res recent del tema, s'ofereix la
  // selecció del dia (tota ella dins la finestra de 5 dies) i prou.
  if (
    activeCategory !== 'Totes' &&
    filteredStories.length === 0 &&
    normalizedQuery === '' &&
    !isServiceSection
  ) {
    const general = [...activeStories].sort(sortByPublishedAtDesc)
    if (general.length > 0) {
      filteredStories = general
      sectionShowingGeneral = true
    }
  }

  // Una peça de servei pot continuar vigent durant setmanes, però això no li
  // dona dret a encapçalar la portada indefinidament. La destacada té un límit
  // propi i mai no es rescata des de l'hemeroteca.
  const headlineEligibleStories = filteredStories.filter(
    (story) =>
      editionReferenceTime - getStoryTimestamp(story) <= featuredStoryMaxAgeMs,
  )
  // La destacada es tria per criteri editorial, no per proximitat. Abans havia
  // de ser de la banda geogràfica més propera disponible: en un diari de
  // proximitat tenia sentit, però en un diari especialitzat d'abast mundial
  // feia que una exposició a Mataró encapçalés la portada per damunt d'una
  // observació del telescopi Webb.
  const featuredStory =
    headlineEligibleStories.find((story) => story.featured) ??
    headlineEligibleStories[0] ??
    null

  const shouldShowFeaturedInResults =
    activeCategory !== 'Totes' || normalizedQuery !== ''
  const remainingStories = filteredStories.filter(
    (story) => shouldShowFeaturedInResults || story.id !== featuredStory?.id,
  )
  // Rescat geogràfic: si el nivell triat inclou fora (Estat, Europa, Món) i no
  // hi ha res recent d'aquells nivells, s'omplen amb el que ja tenim a
  // l'Hemeroteca perquè no quedin buits. No entren mai a la destacada (es tria
  // més amunt, només amb peces recents); només s'afegeixen a la graella.
  const geographicRescue = selectGeographicRescue(
    distanceFilteredStories,
    archiveStories,
    activeDistanceOption.maxRank,
  ).filter(matchesFilters)
  // UN DIARI ESPECIALITZAT S'ORDENA PER DATA, NO PER DISTÀNCIA (14-08-2026).
  //
  // L'ordre per proximitat és una resta de quan El Bon Diari era un diari de
  // proximitat. La barra geogràfica ja es va retirar en fer el gir, però
  // l'ordre no: el servidor enviava l'edició nova i el navegador la reordenava
  // posant al davant tot el que fos de Mataró. La portada semblava encallada
  // en l'edició vella quan en realitat era ben ordenada... per un criteri que
  // ja no és el d'aquest diari.
  const portadaStories = [...remainingStories, ...geographicRescue].sort(
    sortByPublishedAtDesc,
  )
  // Pàgina pròpia d'un tema (/tema/<slug>): una "portada petita" de l'àmbit.
  // Es nodreix de TOT (recent + hemeroteca) del tema perquè no quedi buida; la
  // destacada, però, prova de ser recent abans de recórrer a una peça de fons.
  const topicRoute =
    route.page === 'topic' ? getEditorialTopicBySlug(route.topicSlug) : null
  const topicStories = topicRoute
    ? allStories
        .filter((story) => classifyAllowedEditorialTopic(story) === topicRoute.label)
        .sort(sortByPublishedAtDesc)
    : []
  const topicFeatured =
    topicStories.find(
      (story) =>
        editionReferenceTime - getStoryTimestamp(story) <= featuredStoryMaxAgeMs,
    ) ??
    topicStories[0] ??
    null
  const topicGridStories = topicStories
    .filter((story) => story.id !== topicFeatured?.id)
    .slice(0, 24)
  const topicFeaturedSourceLink = topicFeatured ? getSourceLink(topicFeatured) : null
  const topicFeaturedImageLink = topicFeatured
    ? getImageLink(topicFeatured, topicFeaturedSourceLink)
    : ''

  const currentStory =
    route.page === 'story'
      ? allStories.find((story) => story.id === route.storyId) ??
        (fetchedStory && fetchedStory.id === route.storyId ? fetchedStory : null)
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
        .sort(sortByPublishedAtDesc)
        .slice(0, 3)
    : []
  const requestedArchiveTopic =
    getEditorialTopicBySlug(getSearchParamsFromPath(currentPath).get('tema'))
      ?.label || 'all'
  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    activeCategory !== 'Totes' ||
    activeDistanceFilter !== defaultDistanceFilter
  const headlineCount = filteredStories.length
  const lastRefreshLabel = formatDateTime(lastRefreshAt)

  useEffect(() => {
    let nextTitle = `${siteName} | Periodisme constructiu`
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
        "La Hemeroteca d'El Bon Diari conserva les peces que ja han passat per portada."
    } else if (route.page === 'topics') {
      nextTitle = `Índex de temes | ${siteName}`
      nextDescription =
        "Cultura, Esports, Ciència, Tecnologia, Societat, Religió, Solidaritat, Educació, Economia i Política a El Bon Diari."
    } else if (route.page === 'topic') {
      nextTitle = topicRoute
        ? `${topicRoute.label} | ${siteName}`
        : `Tema no trobat | ${siteName}`
      nextDescription = topicRoute?.description || defaultDescription
    } else if (route.page === 'story' && currentStory) {
      nextTitle = `${currentStory.title} | ${siteName}`
      nextDescription = currentStory.summary || currentStory.impact
      nextType = 'article'
      nextImage = currentStory.imageUrl?.startsWith('http')
        ? currentStory.imageUrl
        : `${siteUrl}${currentStory.imageUrl}`
    } else if (route.page === 'story' && isFetchingStory) {
      nextTitle = `Carregant notícia | ${siteName}`
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
      nextDescription = `Peces de la secció ${activeCategory}, filtrades amb criteri editorial i proximitat.`
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
  }, [activeCategory, currentPath, currentStory, isFetchingStory, route, topicRoute])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hostname === 'localhost') return
    if (currentPath.startsWith('/estadistiques')) return

    try {
      if (window.localStorage.getItem('bondiari-owner') === '1') return
    } catch {
      // localStorage no disponible
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
      if (getRoute(nextPath).page === 'home') {
        const nextFilters = getFilterStateFromPath(nextPath)
        setSearchTerm(nextFilters.search)
        setActiveCategory(nextFilters.category)
        setActiveDistanceFilter(nextFilters.distanceFilter)
      }
    }

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

  async function refreshRadar() {
    try {
      const [payload, editorialStories] = await Promise.all([
        fetchLivePositiveNewsPayload(),
        seedArticlesPromise,
      ])
      setLiveStories((currentStories) =>
        mergeLiveStories(currentStories, payload.stories, editorialStories)
          .stories,
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
    setActiveDistanceFilter(defaultDistanceFilter)

    if (syncUrl && route.page === 'home') {
      navigate('/', { replace: true, scroll })
    }
  }

  async function handleRefresh() {
    setIsRefreshing(true)

    try {
      const [payload, editorialStories] = await Promise.all([
        fetchLivePositiveNewsPayload(),
        seedArticlesPromise,
      ])

      setLiveStories((currentStories) =>
        mergeLiveStories(currentStories, payload.stories, editorialStories)
          .stories,
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
            currentTopicSlug={route.page === 'topic' ? route.topicSlug : null}
            isRefreshing={isRefreshing}
            onNavigate={navigate}
            onRefresh={handleRefresh}
          />

          <main id="contingut" className="site-main">
            <ErrorBoundary>
              <Suspense fallback={<div className="section-block"><h2>Carregant vista…</h2></div>}>
                {route.page === 'story' ? (
                  currentStory ? (
                    <StoryDetailView
                      story={currentStory}
                      sourceLink={currentStorySourceLink}
                      imageLink={currentStoryImageLink}
                      relatedStories={relatedStories}
                      onNavigate={navigate}
                    />
                  ) : isFetchingStory ? (
                    <section className="section-block not-found" role="status">
                      <p className="section-tag">Pàgina d'article</p>
                      <h1>Carregant la notícia…</h1>
                      <p>Estem recuperant aquesta peça de l’hemeroteca.</p>
                    </section>
                  ) : (
                    <NotFoundPage onNavigate={navigate} />
                  )
                ) : null}

                {route.page === 'archive' ? (
                  <ArchiveView
                    key={requestedArchiveTopic}
                    archiveStories={archiveStories}
                    initialTopic={requestedArchiveTopic}
                    lastRefreshLabel={lastRefreshLabel}
                    onNavigate={navigate}
                  />
                ) : null}

                {route.page === 'topics' ? (
                  <TopicsView
                    stories={allStories}
                    activeStoryIds={activeStories.map((story) => story.id)}
                    archiveStoryIds={archiveStories.map((story) => story.id)}
                    onNavigate={navigate}
                  />
                ) : null}

                {route.page === 'topic' ? (
                  <TopicPageView
                    topic={topicRoute}
                    featuredStory={topicFeatured}
                    featuredImageLink={topicFeaturedImageLink}
                    featuredSourceLink={topicFeaturedSourceLink}
                    gridStories={topicGridStories}
                    totalCount={topicStories.length}
                    navigate={navigate}
                  />
                ) : null}

                {route.page === 'home' ? (
                  <PortadaView
                    activeCategory={activeCategory}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    liveTicker={liveTicker}
                    featuredStory={featuredStory}
                    featuredImageLink={featuredImageLink}
                    featuredSourceLink={featuredSourceLink}
                    resetFilters={resetFilters}
                    sectionShowingGeneral={sectionShowingGeneral}
                    headlineCount={headlineCount}
                    isServiceSection={isServiceSection}
                    navigate={navigate}
                    hasActiveFilters={hasActiveFilters}
                    editionStories={activeStories}
                    portadaStories={portadaStories}
                  />
                ) : null}

                {route.page === 'manifest' ? <ManifestView /> : null}

                {route.page === 'stats' ? <StatsView allStories={allStories} /> : null}

                {route.page === 'about' ? <AboutView onNavigate={navigate} /> : null}

                {route.page === 'privacy' ? <PrivacyView onNavigate={navigate} /> : null}

                {route.page === 'saved' ? <SavedView onNavigate={navigate} /> : null}

                {route.page === 'diagnostic' ? <DiagnosticView /> : null}
              </Suspense>
            </ErrorBoundary>
          </main>

          <SiteFooter onNavigate={navigate}>
            <AccessibilityControls />
          </SiteFooter>
        </div>
      </PullToRefresh>
    </div>
  )
}

export default App
