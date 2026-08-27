import { describe, expect, it, vi } from 'vitest'
import {
  buildManualRefreshQueueMessage,
  buildRefreshQueueMessage,
  dailyEditionNeedsRetry,
  handlePipelineBatch,
} from '../pipelineQueue.js'

describe('editorial queue pipeline', () => {
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
