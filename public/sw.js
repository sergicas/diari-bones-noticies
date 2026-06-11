// Service worker mínim per a bondiari.com.
// - Cache-first per a assets estàtics (fonts, imatges, CSS, JS).
// - Network-first amb fallback al cache per a la portada (HTML).
// - Bypass total per a /api/* perquè el radar mai serveixi notícies velles.
// - Esborra caches antigues quan canviem la versió.

const CACHE_VERSION = 'bondiari-shell-v1'
const APP_SHELL = ['/', '/manifest.webmanifest', '/logo-colibri.png?v=4', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return // El radar mai ha de servir cache obsolet

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put('/', copy)).catch(() => undefined)
          return response
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined)
          }
          return response
        })
        .catch(() => cached)
    }),
  )
})
