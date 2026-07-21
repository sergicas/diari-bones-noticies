import { describe, expect, it } from 'vitest'
import {
  handleConfirm,
  handleSubscribe,
  handleUnsubscribe,
} from '../newsletter.js'

class MemoryKv {
  constructor() {
    this.values = new Map()
    this.options = new Map()
  }

  async get(key, type) {
    const value = this.values.get(key)
    if (value === undefined) return null
    if (type === 'json') return JSON.parse(value)
    return value
  }

  async put(key, value, options) {
    this.values.set(key, value)
    this.options.set(key, options)
  }

  async delete(key) {
    this.values.delete(key)
  }
}

async function subscribe(kv) {
  return handleSubscribe(
    new Request('https://bondiari.com/api/newsletter/subscribe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'CF-Connecting-IP': '203.0.113.10',
      },
      body: JSON.stringify({ email: 'lectora@example.com', language: 'ca' }),
    }),
    { STATS_KV: kv },
  )
}

describe('newsletter action tokens', () => {
  it('uses a random action token instead of exposing the email-derived id', async () => {
    const kv = new MemoryKv()
    const response = await subscribe(kv)
    expect(response.status).toBe(200)

    const subscriberKey = [...kv.values.keys()].find((key) =>
      key.startsWith('subscriber:'),
    )
    const record = JSON.parse(kv.values.get(subscriberKey))
    const subscriberId = subscriberKey.slice('subscriber:'.length)

    expect(subscriberId).toMatch(/^[a-f0-9]{36}$/)
    expect(record.actionToken).toMatch(/^[a-f0-9]{64}$/)
    expect(record.actionToken).not.toContain(subscriberId)
    expect(kv.values.get(`newsletter-action:${record.actionToken}`)).toBe(
      subscriberKey,
    )
    expect(kv.options.get(subscriberKey).expirationTtl).toBe(7 * 24 * 60 * 60)
  })

  it('confirms and unsubscribes through the random token', async () => {
    const kv = new MemoryKv()
    await subscribe(kv)
    const subscriberKey = [...kv.values.keys()].find((key) =>
      key.startsWith('subscriber:'),
    )
    const pending = JSON.parse(kv.values.get(subscriberKey))

    const confirmResponse = await handleConfirm(
      new Request(
        `https://bondiari.com/api/newsletter/confirm?token=${pending.actionToken}`,
      ),
      { STATS_KV: kv },
    )
    expect(confirmResponse.status).toBe(200)
    expect(JSON.parse(kv.values.get(subscriberKey)).status).toBe('confirmed')

    const unsubscribeResponse = await handleUnsubscribe(
      new Request(
        `https://bondiari.com/api/newsletter/unsubscribe?token=${pending.actionToken}`,
      ),
      { STATS_KV: kv },
    )
    expect(unsubscribeResponse.status).toBe(200)
    expect(kv.values.has(subscriberKey)).toBe(false)
    expect(kv.values.has(`newsletter-action:${pending.actionToken}`)).toBe(false)
  })

  it('rejects the predictable legacy id after a record has a secure token', async () => {
    const kv = new MemoryKv()
    await subscribe(kv)
    const subscriberKey = [...kv.values.keys()].find((key) =>
      key.startsWith('subscriber:'),
    )
    const legacyId = subscriberKey.slice('subscriber:'.length)
    const response = await handleConfirm(
      new Request(
        `https://bondiari.com/api/newsletter/confirm?token=${legacyId}`,
      ),
      { STATS_KV: kv },
    )
    expect(response.status).toBe(404)
  })
})
