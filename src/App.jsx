import { useEffect, useState, lazy, Suspense } from 'react'
import { flushSync } from 'react-dom'
import './App.css'
import { fetchLivePositiveNewsPayload, fetchLiveTicker } from './api/rssFeed'
import { LIVE_EDITORIAL_VERSION } from './lib/editorial-version.js'
import { feedStoryId } from './lib/story-id.js'
import NotFoundPage from './components/NotFoundPage.jsx'
import PullToRefresh from './components/PullToRefresh.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { canInterceptNavigation, getStoryPath } from './lib/navigation.js'
import {
  DEFAULT_STORY_IMAGE,
  classifyImage,
  hasOriginalPhoto,
} from './lib/imageRules'
import {
  distanceFilterOptions,
  getDistanceBand,
  sortByDistanceAndDate,
} from './lib/distance.js'
import {
  editorialSections,
  serviceSectionIds,
  getStorySection,
} from './lib/sections.js'
import { formatDate, formatDateTime } from './lib/viewHelpers.js'

import PortadaView from './views/PortadaView.jsx'
import StoryDetailView from './views/StoryDetailView.jsx'
import { AccessibilityControls } from './components/AccessibilityControls.jsx'

const ArchiveView = lazy(() => import('./views/ArchiveView.jsx'))
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
// Portada: fins a 5 dies d'antiguitat i un màxim de 24 peces (25-07-2026).
// La resta passa a l'Hemeroteca.
const activeEditionMaxAgeMs = 5 * 24 * 60 * 60 * 1000
const activeEditionMaxStories = 24
const activeEditionFloor = 0
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
    editorialSections.find((section) => section.label === category)?.id ?? ''
  )
}

function getCategoryFromSlug(slug) {
  if (!slug) {
    return 'Totes'
  }
  return (
    editorialSections.find((section) => section.id === slug)?.label ?? 'Totes'
  )
}

function getDistanceFilterFromSlug(slug) {
  return (
    distanceFilterOptions.find((option) => option.id === slug)?.id ??
    'progressiu'
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

function getFilterPath({ category = 'Totes', distanceFilter = 'progressiu', search = '' }) {
  const params = new URLSearchParams()
  const categorySlug = getCategorySlug(category)

  if (categorySlug) {
    params.set('seccio', categorySlug)
  }

  if (distanceFilter !== 'progressiu') {
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
      return storyAge <= 4 * 24 * 60 * 60 * 1000
    })
    .sort(sortByPublishedAtDesc)
    .slice(0, maxStoredFeedStories)

  return {
    stories: mergedStories,
    newCount: newLiveStories.length,
  }
}

function splitEditionStories(stories) {
  const now = Date.now()

  const candidates = stories.filter(
    (story) =>
      story.origin === 'editorial' ||
      now - getStoryTimestamp(story) <= activeEditionMaxAgeMs,
  )

  const activeStories = (
    candidates.length >= activeEditionFloor
      ? candidates
      : [...stories].sort(sortByPublishedAtDesc).slice(0, activeEditionFloor)
  ).slice(0, activeEditionMaxStories)

  const activeIds = new Set(activeStories.map((story) => story.id))

  const archiveStories = stories
    .filter((story) => !activeIds.has(story.id))
    .sort(sortByPublishedAtDesc)

  return {
    activeStories,
    archiveStories,
  }
}

// Marca del propietari: només l'editor veu el botó de recarregar la portada.
// (Es va perdre amb la modularització de la Fase 2 i es restaura amb el masthead.)
function readOwnerFlag() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('bondiari-owner') === '1'
  } catch {
    return false
  }
}

// Capçalera original d'El Bon Diari (masthead Graphis amb el colibrí i la
// graella Mondrian), restaurada tal com era abans de la modularització de la
// Fase 2, que la va substituir per una estructura sense estils.
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
              {isRefreshing ? 'Recarregant…' : 'Recarregar portada'}
            </button>
          </div>
        ) : null}
      </div>

      <div className="masthead__brand masthead__brand--graphis">
        <p className="section-tag">Periodisme constructiu i de servei</p>

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
            <img
              src="/logo-colibri.png?v=4"
              alt=""
              width="977"
              height="829"
              decoding="async"
            />
          </span>
        </a>

        <div className="mondrian-grid" aria-hidden="true">
          <span className="m-cell m-red"></span>
          <span className="m-cell m-blue"></span>
          <span className="m-cell m-yellow"></span>
          <span className="m-cell m-red"></span>

          <span className="m-cell m-black"></span>
          <span className="m-cell m-center">
            <img
              src="/logo-colibri.png?v=4"
              alt=""
              width="977"
              height="829"
              decoding="async"
            />
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
          Històries que expliquen què funciona, comprovacions que separen els
          fets del soroll i informació que pots convertir en una acció.
        </p>
      </div>
    </header>
  )
}

function FooterNote({ onNavigate }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__content">
        <p>
          <strong>El Bon Diari</strong> · Edició digital en català. Selecció
          editorial i desenvolupament a càrrec de Sergi Castillo.
        </p>
        <div className="site-footer__links">
          <a
            href="/manifest"
            onClick={(event) => {
              if (!canInterceptNavigation(event) || !onNavigate) return
              event.preventDefault()
              onNavigate('/manifest')
            }}
          >
            Manifest
          </a>
          <a
            href="/hemeroteca"
            onClick={(event) => {
              if (!canInterceptNavigation(event) || !onNavigate) return
              event.preventDefault()
              onNavigate('/hemeroteca')
            }}
          >
            Hemeroteca
          </a>
          <a
            href="/estadistiques"
            onClick={(event) => {
              if (!canInterceptNavigation(event) || !onNavigate) return
              event.preventDefault()
              onNavigate('/estadistiques')
            }}
          >
            Estadístiques
          </a>
          <a
            href="/sobre"
            onClick={(event) => {
              if (!canInterceptNavigation(event) || !onNavigate) return
              event.preventDefault()
              onNavigate('/sobre')
            }}
          >
            Sobre el diari
          </a>
          <a
            href="/privacitat"
            onClick={(event) => {
              if (!canInterceptNavigation(event) || !onNavigate) return
              event.preventDefault()
              onNavigate('/privacitat')
            }}
          >
            Privacitat
          </a>
          <a href="/feed.xml" target="_blank" rel="noopener noreferrer">
            RSS (Feed)
          </a>
        </div>
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <AccessibilityControls />
        </div>
      </div>
    </footer>
  )
}

function App() {
  const initialFilterState = getFilterStateFromPath(getCurrentPath())
  const [liveStories, setLiveStories] = useState([])
  const [seedStories, setSeedStories] = useState([])
  const [fetchedStory, setFetchedStory] = useState(null)
  const [isFetchingStory, setIsFetchingStory] = useState(
    () => getRoute(getCurrentPath()).page === 'story',
  )
  const [liveTicker, setLiveTicker] = useState([])
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
  }, [route.page, route.storyId, liveStories, seedStories, fetchedStory?.id])

  const allStories = [...liveStories, ...seedStories]
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
  let sectionFromArchive = false
  let sectionShowingGeneral = false
  const activeSection = editorialSections.find(
    (section) => section.label === activeCategory,
  )
  const isServiceSection = serviceSectionIds.has(activeSection?.id)
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
    } else if (normalizedQuery === '' && !isServiceSection) {
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
  const portadaStories = [...remainingStories].sort(sortByDistanceAndDate)
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
  }, [activeCategory, currentPath, currentStory, isFetchingStory, route])

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
      window.setTimeout(() => {
        const target = document.getElementById('noticia-destacada')
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
          target.focus({ preventScroll: true })
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
                    archiveStories={archiveStories}
                    lastRefreshLabel={lastRefreshLabel}
                    onNavigate={navigate}
                  />
                ) : null}

                {route.page === 'home' ? (
                  <PortadaView
                    categories={categories}
                    activeCategory={activeCategory}
                    applyCategoryFilter={applyCategoryFilter}
                    getFilterPath={getFilterPath}
                    activeDistanceFilter={activeDistanceFilter}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    liveTicker={liveTicker}
                    featuredStory={featuredStory}
                    featuredImageLink={featuredImageLink}
                    featuredSourceLink={featuredSourceLink}
                    resetFilters={resetFilters}
                    sectionShowingGeneral={sectionShowingGeneral}
                    sectionFromArchive={sectionFromArchive}
                    headlineCount={headlineCount}
                    isServiceSection={isServiceSection}
                    navigate={navigate}
                    hasActiveFilters={hasActiveFilters}
                    distanceFilterOptions={distanceFilterOptions}
                    applyDistanceFilter={applyDistanceFilter}
                    activeDistanceOption={activeDistanceOption}
                    allStories={allStories}
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

          <FooterNote onNavigate={navigate} />
        </div>
      </PullToRefresh>
    </div>
  )
}

export default App
