import { describe, expect, it, vi } from 'vitest'
import {
  buildManualRefreshQueueMessage,
  buildRefreshQueueMessage,
  buildSelfHealingRefreshQueueMessage,
  dailyEditionNeedsRetry,
  handlePipelineBatch,
} from '../pipelineQueue.js'

describe('editorial queue pipeline', () => {
  it('deduplicates the new morning cron with the legacy cron during migration', () => {
    const scheduledTime = Date.parse('2026-09-15T05:00:00.000Z')
    const legacy = buildRefreshQueueMessage({ cron: '0 5 * * *', scheduledTime })
    const grouped = buildRefreshQueueMessage({ cron: '0 5,13,21 * * *', scheduledTime })
    expect(grouped.idempotencyKey).toBe(legacy.idempotencyKey)
    expect(grouped.distribution).toBe('daily')
  })

  it('creates stable morning messages from cron events', () => {
    const message = buildRefreshQueueMessage({
      cron: '0 5 * * *',
      scheduledTime: Date.parse('2026-07-26T05:00:00.000Z'),
    })
    expect(message.type).toBe('refresh-edition')
    expect(message.slot).toBe('morning')
    expect(message.distribution).toBe('daily')
    expect(message.idempotencyKey).toBe(
      'refresh:0 5 * * *:2026-07-26T05:00',
    )
  })

  it('deduplicates the morning retry against the scheduled edition', () => {
    const primary = buildRefreshQueueMessage({
      cron: '0 5 * * *',
      scheduledTime: Date.parse('2026-09-11T05:00:00.000Z'),
    })
    const retry = buildRefreshQueueMessage({
      cron: '15 5 * * *',
      scheduledTime: Date.parse('2026-09-11T05:15:00.000Z'),
    })

    expect(retry).toMatchObject({
      slot: 'morning',
      distribution: 'daily',
      cron: '15 5 * * *',
    })
    expect(retry.idempotencyKey).toBe(primary.idempotencyKey)
  })

  it('deduplicates the evening retry against the scheduled edition', () => {
    const primary = buildRefreshQueueMessage({
      cron: '0 17 * * *',
      scheduledTime: Date.parse('2026-09-11T17:00:00.000Z'),
    })
    const retry = buildRefreshQueueMessage({
      cron: '15 17 * * *',
      scheduledTime: Date.parse('2026-09-11T17:15:00.000Z'),
    })

    expect(retry).toMatchObject({
      slot: 'evening',
      distribution: 'social',
      cron: '15 17 * * *',
    })
    expect(retry.idempotencyKey).toBe(primary.idempotencyKey)
  })

  it('creates a safe manual refresh with distribution disabled', () => {
    const message = buildManualRefreshQueueMessage({
      idempotencyKey: 'manual:test',
    })
    expect(message).toMatchObject({
      type: 'refresh-edition',
      slot: 'manual',
      distribution: 'none',
      idempotencyKey: 'manual:test',
    })
  })

  it('creates one stable self-healing job for the stale edition', () => {
    const payload = { nextRefreshAt: '2026-09-10T17:01:13.772Z' }
    const first = buildSelfHealingRefreshQueueMessage(payload)
    const second = buildSelfHealingRefreshQueueMessage(payload)

    expect(first).toMatchObject({
      type: 'refresh-edition',
      slot: 'manual',
      distribution: 'none',
      idempotencyKey: 'refresh:self-heal:v23:2026-09-10T17:01',
    })
    expect(second.idempotencyKey).toBe(first.idempotencyKey)
  })

  it('reintenta el cron del matí fins que hi ha una notícia nova', () => {
    expect(
      dailyEditionNeedsRetry(
        { distribution: 'daily' },
        { publishedCount: 0 },
      ),
    ).toBe(true)
    expect(
      dailyEditionNeedsRetry(
        { distribution: 'daily' },
        { publishedCount: 1 },
      ),
    ).toBe(false)
    expect(
      dailyEditionNeedsRetry(
        { distribution: 'none' },
        { publishedCount: 0 },
      ),
    ).toBe(false)
  })

  it('retries invalid messages instead of acknowledging them', async () => {
    const ack = vi.fn()
    const retry = vi.fn()
    await handlePipelineBatch(
      {
        queue: 'bondiari-ingest-test',
        messages: [
          {
            id: 'message-1',
            body: { type: 'unknown' },
            attempts: 1,
            ack,
            retry,
          },
        ],
      },
      {},
    )
    expect(ack).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 15 })
  })
})
