import { describe, it, expect } from 'vitest'
import { fetchAndReadWithTimeout } from '../rss/serviceFeeds.js'

describe('fetchAndReadWithTimeout body timeout protection', () => {
  it('resolves cleanly when response and body arrive quickly', async () => {
    const mockFetch = async () => ({ ok: true, status: 200 })
    const mockReader = async () => 'sample body content'

    const res = await fetchAndReadWithTimeout(
      'https://example.com/api',
      {},
      mockReader,
      3000,
      mockFetch,
    )
    expect(res.ok).toBe(true)
    expect(res.data).toBe('sample body content')
  })

  it('aborts and throws when body reading hangs beyond timeout', async () => {
    const mockFetch = async () => ({ ok: true, status: 200 })
    const hangingReader = (res, signal) =>
      new Promise((_, reject) => {
        if (signal.aborted) return reject(new Error('Aborted by signal timeout'))
        signal.addEventListener('abort', () =>
          reject(new Error('Aborted by signal timeout')),
        )
      })

    const start = Date.now()
    try {
      await fetchAndReadWithTimeout(
        'https://example.com/api',
        {},
        hangingReader,
        50,
        mockFetch,
      )
      expect.fail('Hauria d’haver llançat una excepció per timeout de cos')
    } catch (error) {
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(1000)
      expect(error.message).toContain('Aborted by signal timeout')
    }
  })
})
