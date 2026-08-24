import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceWorkerSource = readFileSync(
  new URL('../../../public/sw.js', import.meta.url),
  'utf8',
)

function basicResponse(body, init = {}) {
  const response = new Response(body, init)
  Object.defineProperty(response, 'type', { value: 'basic' })
  return response
}

function createHarness({ fetchImpl, matchImpl } = {}) {
  const handlers = new Map()
  const put = vi.fn(async () => undefined)
  const cache = {
    addAll: vi.fn(async () => undefined),
    put,
  }
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    match: vi.fn(matchImpl || (async () => undefined)),
  }
  const self = {
    location: { origin: 'https://bondiari.com' },
    addEventListener: (type, handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(async () => undefined),
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => []),
      openWindow: vi.fn(async () => undefined),
    },
    registration: { showNotification: vi.fn(async () => undefined) },
  }

  vm.runInNewContext(serviceWorkerSource, {
    self,
    caches,
    fetch: vi.fn(fetchImpl || (async () => basicResponse('ok'))),
    URL,
    Request,
    Response,
    Promise,
    JSON,
    Error,
  })

  return { handlers, caches, put }
}

async function dispatchFetch(handler, request) {
  const lifetime = []
  let responsePromise
  handler({
    request,
    waitUntil: (promise) => lifetime.push(promise),
    respondWith: (promise) => {
      responsePromise = Promise.resolve(promise)
    },
  })

  const response = await responsePromise
  await Promise.all(lifetime)
  return response
}

describe('service worker offline routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('stores a visited story under its own request instead of overwriting home', async () => {
    const harness = createHarness({
      fetchImpl: async () => basicResponse('<article>Notícia</article>'),
    })
    const request = new Request('https://bondiari.com/noticia/exemple', {
      headers: { accept: 'text/html' },
    })
    Object.defineProperty(request, 'mode', { value: 'navigate' })

    const response = await dispatchFetch(harness.handlers.get('fetch'), request)

    expect(response.status).toBe(200)
    expect(harness.put).toHaveBeenCalledTimes(1)
    expect(harness.put.mock.calls[0][0]).toBe(request)
  })

  it('uses the cached route before falling back to the cached home page', async () => {
    const cachedStory = basicResponse('<article>Offline</article>')
    const request = new Request('https://bondiari.com/noticia/desada')
    Object.defineProperty(request, 'mode', { value: 'navigate' })
    const harness = createHarness({
      fetchImpl: async () => {
        throw new Error('offline')
      },
      matchImpl: async (key) => (key === request ? cachedStory : undefined),
    })

    const response = await dispatchFetch(harness.handlers.get('fetch'), request)

    await expect(response.text()).resolves.toContain('Offline')
    expect(harness.caches.match).toHaveBeenCalledWith(request)
    expect(harness.caches.match).not.toHaveBeenCalledWith('/')
  })

  it('returns an explicit 503 JSON response when the live radar has no cache', async () => {
    const harness = createHarness({
      fetchImpl: async () => {
        throw new Error('offline')
      },
    })
    const request = new Request('https://bondiari.com/api/live-news')

    const response = await dispatchFetch(harness.handlers.get('fetch'), request)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: 'offline',
      stories: [],
    })
  })
})
