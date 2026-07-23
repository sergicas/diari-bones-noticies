import { describe, it, expect } from 'vitest'
import { fetchAndReadWithTimeout } from '../rss/serviceFeeds.js'

describe('fetchAndReadWithTimeout body timeout protection with ReadableStream', () => {
  it('resolves cleanly when response body stream arrives quickly', async () => {
    const mockResponse = new Response('sample body content', { status: 200 })
    const mockFetch = async () => mockResponse

    const res = await fetchAndReadWithTimeout(
      'https://example.com/api',
      {},
      (r) => r.text(),
      3000,
      mockFetch,
    )
    expect(res.ok).toBe(true)
    expect(res.data).toBe('sample body content')
  })

  it('aborts and cancels when body stream hangs beyond timeout', async () => {
    const hangingStream = new ReadableStream({
      start() {},
      cancel() {},
    })
    const mockResponse = new Response(hangingStream, { status: 200 })
    const mockFetch = async () => mockResponse

    const start = Date.now()
    try {
      await fetchAndReadWithTimeout(
        'https://example.com/api',
        {},
        (r) => r.text(),
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
