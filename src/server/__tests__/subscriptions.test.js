import { describe, expect, it, vi } from 'vitest'
import { handleApnsRegister } from '../apns.js'
import { handlePushSubscribe } from '../push.js'

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
        body: JSON.stringify({ token: 'a'.repeat(64) }),
      }),
      { STATS_KV: { put } },
    )
    expect(valid.status).toBe(200)
    expect(put).toHaveBeenCalledOnce()
  })
})
