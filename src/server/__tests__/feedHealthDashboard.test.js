import { describe, it, expect } from 'vitest'
import { isFeedHealthAuthorized } from '../../worker.js'

describe('Feed Health Dashboard & Authorization Tests', () => {
  const env = {
    BONDIARI_FEED_HEALTH_TOKEN: 'test-secret-token-123',
  }

  it('authorizes Bearer token header', async () => {
    const req = new Request('https://bondiari.com/api/feed-health', {
      headers: { authorization: 'Bearer test-secret-token-123' },
    })
    const authorized = await isFeedHealthAuthorized(req, env)
    expect(authorized).toBe(true)
  })

  it('authorizes x-health-token header', async () => {
    const req = new Request('https://bondiari.com/api/feed-health', {
      headers: { 'x-health-token': 'test-secret-token-123' },
    })
    const authorized = await isFeedHealthAuthorized(req, env)
    expect(authorized).toBe(true)
  })

  it('rejects ?token= URL parameter (els tokens no han de viatjar dins l’URL)', async () => {
    const req = new Request(
      'https://bondiari.com/api/feed-health?token=test-secret-token-123',
    )
    const authorized = await isFeedHealthAuthorized(req, env)
    expect(authorized).toBe(false)
  })

  it('rejects unauthorized request with wrong token', async () => {
    const req = new Request('https://bondiari.com/api/feed-health', {
      headers: { 'x-health-token': 'wrong-token' },
    })
    const authorized = await isFeedHealthAuthorized(req, env)
    expect(authorized).toBe(false)
  })
})
