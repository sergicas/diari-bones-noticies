import { describe, expect, it, vi } from 'vitest'
import {
  beginPipelineJob,
  editionIdFor,
  persistEditorialEdition,
} from '../editorialStore.js'

function fakeStatement(query, runs) {
  return {
    query,
    values: [],
    bind(...values) {
      this.values = values
      return this
    },
    async run() {
      runs.push({ query: this.query, values: this.values })
      return { success: true, meta: { changes: 1 } }
    },
  }
}

function createFakeDb() {
  const runs = []
  const batches = []
  return {
    runs,
    batches,
    prepare(query) {
      return fakeStatement(query, runs)
    },
    async batch(statements) {
      batches.push(statements)
      return statements.map(() => ({ success: true, meta: { changes: 1 } }))
    },
  }
}

describe('editorial D1 store', () => {
  it('builds a stable edition id', () => {
    expect(
      editionIdFor({ updatedAt: '2026-07-26T07:00:00.000Z' }, 'morning'),
    ).toBe('edition:2026-07-26T07:00:00.000Z:morning')
  })

  it('persists the edition and batches story statements', async () => {
    const db = createFakeDb()
    const result = await persistEditorialEdition(
      { EDITORIAL_DB: db },
      {
        updatedAt: '2026-07-26T07:00:00.000Z',
        stories: [
          {
            id: 'story-1',
            url: 'https://example.com/story-1',
            title: 'Una història constructiva',
            category: 'Societat',
          },
        ],
      },
      { slot: 'morning', trigger: 'test' },
    )

    expect(result).toEqual({
      editionId: 'edition:2026-07-26T07:00:00.000Z:morning',
      storyCount: 1,
    })
    expect(db.runs).toHaveLength(1)
    expect(db.batches).toHaveLength(1)
    expect(db.batches[0]).toHaveLength(2)
  })

  it('skips a pipeline job already completed', async () => {
    const run = vi.fn().mockResolvedValue({ meta: { changes: 0 } })
    const db = {
      prepare: () => ({
        bind() {
          return { run }
        },
      }),
    }
    await expect(
      beginPipelineJob(
        { EDITORIAL_DB: db },
        { idempotencyKey: 'job:1', type: 'refresh-edition' },
      ),
    ).resolves.toEqual({ shouldRun: false, persisted: true })
  })
})
