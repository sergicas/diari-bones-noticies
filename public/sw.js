// Service worker mínim per a bondiari.com.
// - Cache-first per a assets estàtics (fonts, imatges, CSS, JS).
// - Network-first amb fallback al cache per a la portada (HTML).
// - Network-first amb fallback al darrer radar per a /api/live-news.
// - Bypass per a la resta de /api/*, que no s'han de reproduir offline.
// - Esborra caches antigues quan canviem la versió.

// __BUILD_HASH__ es substitueix pel plugin de Vite (vite.config.js) durant
// el build amb el hash dels assets. Així cada deploy canvia el nom del
// cache i les versions antigues s'esborren al següent activate.
const CACHE_VERSION = 'bondiari-shell-__BUILD_HASH__'
const APP_SHELL = ['/', '/manifest.webmanifest', '/logo-colibri.png?v=4', '/favicon.svg']

function cacheResponse(request, response) {
  if (!response.ok || response.type !== 'basic') return Promise.resolve()
  return caches
    .open(CACHE_VERSION)
    .then((cache) => cache.put(request, response.clone()))
}

function offlineJson() {
  return new Response(JSON.stringify({ error: 'offline', stories: [] }), {
    status: 503,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function offlinePage() {
  return new Response(
    '<!doctype html><html lang="ca"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sense connexió · El Bon Diari</title><body><main><h1>Ara mateix no hi ha connexió</h1><p>Torna-ho a provar quan recuperis la xarxa.</p></main></body></html>',
    {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    },
  )
}

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

  if (url.pathname === '/api/live-news') {
    const networkResponse = fetch(request).then((response) => {
      if (!response.ok) throw new Error(`live-news-${response.status}`)
      return response
    })
    event.waitUntil(
      networkResponse
        .then((response) => cacheResponse(request, response))
        .catch(() => undefined),
    )
    event.respondWith(
      networkResponse.catch(async () => (await caches.match(request)) || offlineJson()),
    )
    return
  }

  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    const networkResponse = fetch(request)
    event.waitUntil(
      networkResponse
        .then((response) => cacheResponse(request, response))
        .catch(() => undefined),
    )
    event.respondWith(
      networkResponse.catch(async () =>
        (await caches.match(request)) || (await caches.match('/')) || offlinePage(),
      ),
    )
    return
  }

  const cachedResponse = caches.match(request)
  const networkResponse = cachedResponse.then((cached) =>
    cached ? null : fetch(request),
  )
  event.waitUntil(
    networkResponse
      .then((response) =>
        response ? cacheResponse(request, response) : undefined,
      )
      .catch(() => undefined),
  )
  event.respondWith(
    Promise.all([cachedResponse, networkResponse])
      .then(([cached, network]) => cached || network || Response.error())
      .catch(() => Response.error()),
  )
})

// --- Notificacions push -----------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = data.title || 'El Bon Diari'
  const options = {
    body: data.body || '',
    icon: data.icon || '/logo-colibri.png?v=4',
    badge: '/logo-colibri.png?v=4',
    lang: 'ca',
    tag: 'bondiari-daily',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        return self.clients.openWindow(url)
      }),
  )
})
