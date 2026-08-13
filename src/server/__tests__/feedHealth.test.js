import { describe, expect, it, vi } from 'vitest'
import {
  fetchFeed,
  collectFeedStories,
  isFeedPaused,
  isSignificantHealthChange,
  readFeedHealthStats,
  saveFeedHealthStats,
  FEED_HEALTH_KV_KEY,
} from '../liveNews.js'
import worker from '../../worker.js'

describe('feed health and circuit breaker', () => {
  it('fetchFeed handles timeout using AbortController during headers or body read', async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(
      (_url, options) =>
        new Promise((resolve) => {
          options?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            reject(err)
          })
          let reject
          const fakeResponse = {
            ok: true,
            status: 200,
            text: () =>
              new Promise((_res, rej) => {
                reject = rej
              }),
          }
          resolve(fakeResponse)
        }),
    )

    const feed = { name: 'Test Hanging Body Feed', url: 'https://example.com/slowbody.xml' }
    const result = await fetchFeed(feed, { timeoutMs: 50 })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Timeout')
    expect(result.status).toBe(0)

    globalThis.fetch = origFetch
  })

  it('fetchFeed returns error on HTTP 404', async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })

    const feed = { name: 'Test Missing Feed', url: 'https://example.com/404.xml' }
    const result = await fetchFeed(feed)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
    expect(result.error).toBe('HTTP 404')

    globalThis.fetch = origFetch
  })

  it('envia capçaleres de navegador a totes les fonts RSS', async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<rss><channel><item><title>Prova</title></item></channel></rss>',
    })

    await fetchFeed({ name: 'Browser headers', url: 'https://example.com/feed.xml' })
    const request = globalThis.fetch.mock.calls[0][1]
    expect(request.headers['user-agent']).toContain('Mozilla/5.0')
    expect(request.headers.accept).toContain('application/rss+xml')
    expect(request.headers['accept-language']).toContain('ca-ES')
    globalThis.fetch = origFetch
  })

  it('reintenta errors transitoris amb el timeout configurat de la font', async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('xarxa temporal'))
      .mockRejectedValueOnce(new Error('xarxa temporal'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<rss><channel><item><title>Prova</title></item></channel></rss>',
      })

    const result = await fetchFeed(
      { name: 'Retry', url: 'https://example.com/feed.xml', fetch: { timeoutMs: 12000, maxAttempts: 3, retryDelayMs: 0 } },
    )
    expect(result).toMatchObject({ ok: true, attempts: 3 })
    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
    globalThis.fetch = origFetch
  })

  it('collectFeedStories updates consecutiveFailures on failure', async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const feed = { name: 'Failing Feed', url: 'https://example.com/500.xml' }
    const res = await collectFeedStories(feed, {
      healthRecord: { consecutiveFailures: 2 },
    })

    expect(res.stories).toHaveLength(0)
    expect(res.healthUpdate.consecutiveFailures).toBe(3)
    expect(res.healthUpdate.pausedUntil).toBeNull()

    globalThis.fetch = origFetch
  })

  it('collectFeedStories marks valid RSS with 0 items as empty', async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<rss><channel><title>Empty Feed</title></channel></rss>',
    })

    const feed = { name: 'Empty Feed', url: 'https://example.com/empty.xml' }
    const res = await collectFeedStories(feed)

    expect(res.stories).toHaveLength(0)
    expect(res.healthUpdate.status).toBe('empty')
    expect(res.healthUpdate.rawItemCount).toBe(0)

    globalThis.fetch = origFetch
  })

  it('la font Europe PMC de longevitat només admet estudis humans CC BY', async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `<?xml version="1.0"?><responseWrapper><resultList>
        <result><pmcid>PMC-HUMAN</pmcid><title>Immune resilience in human longevity</title><firstPublicationDate>2026-08-10</firstPublicationDate><license>cc by</license><pubType>Journal Article</pubType><abstractText>Centenarian participants show an ageing-related immune pattern.</abstractText><meshHeadingList><meshHeading><descriptorName>Humans</descriptorName></meshHeading></meshHeadingList><journal><title>Aging Cell</title></journal></result>
        <result><pmcid>PMC-MOSQUIT</pmcid><title>Longevity in mosquitoes</title><firstPublicationDate>2026-08-10</firstPublicationDate><license>cc by</license><pubType>Journal Article</pubType><abstractText>Adult mosquitoes show a lifespan change.</abstractText></result>
      </resultList></responseWrapper>`,
    })
    const res = await collectFeedStories({
      name: 'Europe PMC · Longevitat',
      url: 'https://example.com/europe-pmc.xml',
      format: 'europe-pmc-search',
      language: 'en', outputLanguage: 'ca', defaultCategory: 'Salut', circuit: 'A',
      sourceTopic: 'Longevitat', reuseLicense: 'CC BY',
      activation: { required: true, licenseConfirmed: true },
    }, { now: Date.parse('2026-08-12T12:00:00Z') })

    expect(res.candidates).toBe(2)
    expect(res.stories).toHaveLength(1)
    expect(res.stories[0]).toMatchObject({
      title: 'Immune resilience in human longevity',
      study: { journal: 'Aging Cell', peerReviewed: true, openAccessLicense: 'CC BY' },
    })
    globalThis.fetch = origFetch
  })

  it('collectFeedStories triggers circuit breaker after 5 failures', async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    })

    const feed = { name: 'Failing Feed', url: 'https://example.com/503.xml' }
    const res = await collectFeedStories(feed, {
      healthRecord: { consecutiveFailures: 4 },
      now: 1000000,
    })

    expect(res.healthUpdate.consecutiveFailures).toBe(5)
    expect(res.healthUpdate.pausedUntil).not.toBeNull()
    expect(new Date(res.healthUpdate.pausedUntil).getTime()).toBe(
      1000000 + 24 * 60 * 60 * 1000,
    )

    globalThis.fetch = origFetch
  })

  it('collectFeedStories skips paused feed when circuit breaker is active', async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = vi.fn()

    const feed = { name: 'Paused Feed', url: 'https://example.com/paused.xml' }
    const now = 1000000
    const res = await collectFeedStories(feed, {
      healthRecord: {
        consecutiveFailures: 5,
        pausedUntil: new Date(now + 3600000).toISOString(),
      },
      now,
    })

    expect(res.skipped).toBe(true)
    expect(globalThis.fetch).not.toHaveBeenCalled()

    globalThis.fetch = origFetch
  })

  it('isFeedPaused correctly checks expiration', () => {
    const now = 1000000
    const activePause = { pausedUntil: new Date(now + 5000).toISOString() }
    const expiredPause = { pausedUntil: new Date(now - 5000).toISOString() }

    expect(isFeedPaused(activePause, now)).toBe(true)
    expect(isFeedPaused(expiredPause, now)).toBe(false)
    expect(isFeedPaused(null, now)).toBe(false)
  })

  it('isSignificantHealthChange detects status/failure changes correctly', () => {
    const okRecord = { status: 'ok', consecutiveFailures: 0, pausedUntil: null }
    const sameOkRecord = { status: 'ok', consecutiveFailures: 0, pausedUntil: null }
    const errRecord = { status: 'error', consecutiveFailures: 1, pausedUntil: null }

    expect(isSignificantHealthChange(okRecord, sameOkRecord)).toBe(false)
    expect(isSignificantHealthChange(okRecord, errRecord)).toBe(true)
    expect(isSignificantHealthChange(null, okRecord)).toBe(false)
    expect(isSignificantHealthChange(null, errRecord)).toBe(true)
  })

  it('readFeedHealthStats returns _readError on KV error and saveFeedHealthStats protects KV', async () => {
    const errorKv = {
      get: vi.fn().mockRejectedValue(new Error('KV connection error')),
      put: vi.fn(),
    }
    const env = { LIVE_NEWS_KV: errorKv }

    const loaded = await readFeedHealthStats(env)
    expect(loaded._readError).toBe(true)

    // Should NOT overwrite KV when _readError is present
    await saveFeedHealthStats(env, loaded)
    expect(errorKv.put).not.toHaveBeenCalled()
  })

  it('returns HTTP 503 from /api/feed-health when KV read error occurs', async () => {
    const errorKv = {
      get: vi.fn().mockRejectedValue(new Error('KV connection error')),
    }
    const env = {
      BONDIARI_REFRESH_TOKEN: 'secret-token',
      LIVE_NEWS_KV: errorKv,
    }

    const res = await worker.fetch(
      new Request('https://bondiari.com/api/feed-health', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      env,
      {},
    )

    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.error).toBe('kv-read-error')
  })

  it('strictly enforces dedicated BONDIARI_FEED_HEALTH_TOKEN when configured', async () => {
    const env = {
      BONDIARI_FEED_HEALTH_TOKEN: 'health-token-only',
      BONDIARI_REFRESH_TOKEN: 'refresh-token-only',
      LIVE_NEWS_KV: { get: vi.fn().mockResolvedValue({}) },
    }

    // Refresh token should be rejected when dedicated health token is present
    const rejectRefresh = await worker.fetch(
      new Request('https://bondiari.com/api/feed-health', {
        headers: { authorization: 'Bearer refresh-token-only' },
      }),
      env,
      {},
    )
    expect(rejectRefresh.status).toBe(401)

    // Dedicated health token should be accepted
    const acceptHealth = await worker.fetch(
      new Request('https://bondiari.com/api/feed-health', {
        headers: { authorization: 'Bearer health-token-only' },
      }),
      env,
      {},
    )
    expect(acceptHealth.status).toBe(200)
  })
})
