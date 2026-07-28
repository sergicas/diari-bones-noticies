import { describe, expect, it, vi } from 'vitest'
import worker, { isRefreshAuthorized } from '../../worker.js'

describe('manual refresh protection', () => {
  it('compares the bearer token and rejects missing credentials', async () => {
    const authorized = new Request('https://bondiari.com/api/refresh-news', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-value' },
    })
    const missing = new Request('https://bondiari.com/api/refresh-news', {
      method: 'POST',
    })

    await expect(
      isRefreshAuthorized(authorized, {
        BONDIARI_REFRESH_TOKEN: 'secret-value',
      }),
    ).resolves.toBe(true)
    await expect(
      isRefreshAuthorized(missing, {
        BONDIARI_REFRESH_TOKEN: 'secret-value',
      }),
    ).resolves.toBe(false)
  })

  it('returns a secured 401 before starting expensive refresh work', async () => {
    const response = await worker.fetch(
      new Request('https://bondiari.com/api/refresh-news', { method: 'POST' }),
      {},
      {},
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'self'",
    )
  })

  it('protects the archive recovery with the same bearer secret', async () => {
    const response = await worker.fetch(
      new Request('https://bondiari.com/api/archive-backfill', { method: 'POST' }),
      {},
      {},
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('queues an authenticated ingest without distribution by default', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const response = await worker.fetch(
      new Request('https://bondiari.com/api/pipeline-trigger', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-value',
          'idempotency-key': 'manual:test',
        },
      }),
      {
        BONDIARI_REFRESH_TOKEN: 'secret-value',
        INGEST_QUEUE: { send },
      },
      {},
    )

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      queued: true,
      distribution: 'none',
      idempotencyKey: 'manual:test',
    })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'refresh-edition',
        distribution: 'none',
      }),
      { contentType: 'json' },
    )
  })

  it('returns one authenticated operations snapshot for the dashboard', async () => {
    const now = new Date().toISOString()
    const kv = {
      get: vi.fn(async (key) => {
        if (key === 'feed-health-stats') return {}
        if (key === 'cron-timing:latest') {
          return { updatedAt: now, cronDurationMs: 2400 }
        }
        if (key === 'subscriber:reader') {
          return {
            email: 'lectora@example.com',
            language: 'ca',
            status: 'confirmed',
            subscribedAt: now,
            confirmedAt: now,
            actionToken: 'not-exposed',
          }
        }
        return null
      }),
      list: vi.fn(async () => ({
        keys: [{ name: 'subscriber:reader' }],
        list_complete: true,
      })),
    }
    const database = {
      prepare(query) {
        return {
          async first() {
            if (query.includes('FROM stories')) return { total: 3 }
            if (query.includes('FROM editions') && query.includes('COUNT')) {
              return { total: 1 }
            }
            if (query.includes('FROM pipeline_jobs')) {
              return {
                processing: 0,
                stale_processing: 0,
                failed: 0,
                completed: 1,
              }
            }
            if (query.includes('FROM delivery_runs')) return { total: 0 }
            if (query.includes('FROM newsletter_subscribers')) {
              return { confirmed: 0, pending: 0 }
            }
            return null
          },
          async all() {
            return { results: [] }
          },
        }
      },
    }
    const metrics = vi
      .fn()
      .mockResolvedValue({ backlogCount: 0, backlogBytes: 0 })

    const response = await worker.fetch(
      new Request(
        'https://bondiari.com/api/feed-health?mode=dashboard',
        { headers: { 'x-health-token': 'health-secret' } },
      ),
      {
        BONDIARI_FEED_HEALTH_TOKEN: 'health-secret',
        LIVE_NEWS_KV: kv,
        STATS_KV: kv,
        EDITORIAL_DB: database,
        INGEST_QUEUE: { metrics },
        DISTRIBUTION_QUEUE: { metrics },
      },
      {},
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      ok: true,
      pipeline: {
        database: {
          available: true,
          stories: 3,
          editions: 1,
        },
        queues: {
          ingest: { available: true, backlogCount: 0 },
          distribution: { available: true, backlogCount: 0 },
        },
      },
      operations: {
        status: 'healthy',
        issues: [],
      },
      audience: {
        available: true,
        confirmed: 1,
        pending: 0,
        subscribers: [
          {
            email: 'lectora@example.com',
            status: 'confirmed',
          },
        ],
      },
    })
    expect(JSON.stringify(payload.audience)).not.toContain('not-exposed')
  })
})
