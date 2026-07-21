import { describe, expect, it } from 'vitest'
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
})
