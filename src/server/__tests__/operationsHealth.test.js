import { describe, expect, it } from 'vitest'
import { buildOperationalHealth } from '../operationsHealth.js'

function healthyPipeline() {
  return {
    database: {
      available: true,
      jobs: {
        processing: 0,
        staleProcessing: 0,
        failed: 0,
        completed: 4,
      },
    },
    queues: {
      ingest: { available: true, backlogCount: 0, backlogBytes: 0 },
      distribution: { available: true, backlogCount: 0, backlogBytes: 0 },
    },
  }
}

describe('operational health', () => {
  it('reports a healthy system with fresh telemetry and empty queues', () => {
    const now = Date.parse('2026-07-26T17:00:00.000Z')
    const result = buildOperationalHealth({
      now,
      cronTiming: { updatedAt: '2026-07-26T16:30:00.000Z' },
      pipeline: healthyPipeline(),
    })

    expect(result.status).toBe('healthy')
    expect(result.issues).toEqual([])
  })

  it('raises a critical state for stale jobs and an old queue', () => {
    const now = Date.parse('2026-07-26T17:00:00.000Z')
    const pipeline = healthyPipeline()
    pipeline.database.jobs.staleProcessing = 1
    pipeline.queues.ingest = {
      available: true,
      backlogCount: 120,
      oldestMessageTimestamp: '2026-07-26T15:00:00.000Z',
    }

    const result = buildOperationalHealth({
      now,
      cronTiming: { updatedAt: '2026-07-25T12:00:00.000Z' },
      pipeline,
    })

    expect(result.status).toBe('critical')
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'cron-stale-critical',
        'pipeline-stale-jobs',
        'queue-ingesta-backlog-critical',
        'queue-ingesta-age-critical',
      ]),
    )
  })

  it('keeps a new environment visible as a warning instead of healthy', () => {
    const result = buildOperationalHealth({
      now: Date.parse('2026-07-26T17:00:00.000Z'),
      pipeline: healthyPipeline(),
    })

    expect(result.status).toBe('warning')
    expect(result.issues[0].code).toBe('cron-no-data')
  })
})

