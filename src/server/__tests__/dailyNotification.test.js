import { describe, expect, it } from 'vitest'
import {
  claimDailyNotification,
  selectDailyNotificationStory,
} from '../dailyNotification.js'

describe('daily notification judge and cap', () => {
  it('chooses the highest editorial impact score', () => {
    const stories = [
      { id: 'a', category: 'Ciència', impactScore: 3 },
      { id: 'b', category: 'Tecnologia', impactScore: 9 },
    ]
    expect(selectDailyNotificationStory(stories, 'Tecnologia').id).toBe('b')
  })

  it('uses category diversity only to break an impact tie', () => {
    const stories = [
      { id: 'a', category: 'Ciència', impactScore: 5 },
      { id: 'b', category: 'Tecnologia', impactScore: 5 },
    ]
    expect(selectDailyNotificationStory(stories, 'Ciència').id).toBe('b')
    expect(selectDailyNotificationStory(stories, null).id).toBe('a')
  })

  it('atomically refuses a second claim for the same device, channel and day', async () => {
    const claims = new Set()
    const env = {
      EDITORIAL_DB: {
        prepare: () => ({
          bind: (day, channel, hash) => ({
            run: async () => {
              const key = `${day}:${channel}:${hash}`
              const changes = claims.has(key) ? 0 : 1
              claims.add(key)
              return { meta: { changes } }
            },
          }),
        }),
      },
    }
    const delivery = {
      day: '2026-08-24',
      channel: 'web',
      recipient: 'https://push.example/device',
      storyId: 'story-1',
    }
    expect((await claimDailyNotification(env, delivery)).claimed).toBe(true)
    expect((await claimDailyNotification(env, delivery)).claimed).toBe(false)
    expect((await claimDailyNotification(env, { ...delivery, channel: 'apns' })).claimed).toBe(true)
  })

  it('fails closed without D1 so an outage cannot create duplicate pushes', async () => {
    expect(
      await claimDailyNotification({}, {
        day: '2026-08-24', channel: 'web', recipient: 'device', storyId: 'story-1',
      }),
    ).toMatchObject({ claimed: false, skipped: 'missing-d1-binding' })
  })
})
