import { describe, expect, it, vi } from 'vitest'
import { handleApnsRegister, handleApnsUnregister } from '../apns.js'
import { handlePushSubscribe, handlePushUnsubscribe } from '../push.js'

describe('push subscription validation', () => {
  it('rejects non-HTTPS web push endpoints', async () => {
    const put = vi.fn()
    const response = await handlePushSubscribe(
      new Request('https://bondiari.com/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: 'http://example.com/push',
          keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
        }),
      }),
      { STATS_KV: { put } },
    )

    expect(response.status).toBe(400)
    expect(put).not.toHaveBeenCalled()
  })

  it('only stores canonical 64-character APNs device tokens', async () => {
    const put = vi.fn()
    const invalid = await handleApnsRegister(
      new Request('https://bondiari.com/api/push/register-apns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: '../not-a-device-token' }),
      }),
      { STATS_KV: { put } },
    )
    expect(invalid.status).toBe(400)
    expect(put).not.toHaveBeenCalled()

    const valid = await handleApnsRegister(
      new Request('https://bondiari.com/api/push/register-apns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'a'.repeat(64), option: 'daily' }),
      }),
      { STATS_KV: { put } },
    )
    expect(valid.status).toBe(200)
    expect(put).toHaveBeenCalledOnce()
    expect(JSON.parse(put.mock.calls[0][1])).toMatchObject({ option: 'daily' })
  })

  it('stores the single web option and deletes the server subscription on opt-out', async () => {
    const put = vi.fn()
    const del = vi.fn()
    const endpoint = 'https://push.example.com/subscription/1'
    const response = await handlePushSubscribe(
      new Request('https://bondiari.com/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          option: 'daily',
          subscription: {
            endpoint,
            keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
          },
        }),
      }),
      { STATS_KV: { put } },
    )
    expect(response.status).toBe(200)
    expect(JSON.parse(put.mock.calls[0][1])).toMatchObject({ endpoint, option: 'daily' })

    const removed = await handlePushUnsubscribe(
      new Request('https://bondiari.com/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      }),
      { STATS_KV: { delete: del } },
    )
    expect(removed.status).toBe(200)
    expect(del).toHaveBeenCalledOnce()
  })

  it('removes a native token from the server on opt-out', async () => {
    const del = vi.fn()
    const response = await handleApnsUnregister(
      new Request('https://bondiari.com/api/push/unregister-apns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'c'.repeat(64) }),
      }),
      { STATS_KV: { delete: del } },
    )
    expect(response.status).toBe(200)
    expect(del).toHaveBeenCalledOnce()
  })
})
