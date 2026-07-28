import { describe, expect, it, vi } from 'vitest'
import {
  backfillEditorialArchive,
  beginPipelineJob,
  editionIdFor,
  persistEditorialEdition,
  readEditorialStoryCatalog,
  readUniqueEditorialStats,
} from '../editorialStore.js'

function publishableStory(overrides = {}) {
  return {
    id: 'story-cultura',
    url: 'https://example.com/story-cultura',
    title: 'La biblioteca obre un espai de lectura i música per al barri',
    category: 'Cultura',
    source: 'Mitjà local',
    language: 'ca',
    ownContent: true,
    editorialFormat: 'constructive',
    publishedAt: new Date().toISOString(),
    body: [
      'La biblioteca municipal ha obert aquesta setmana una sala de lectura i música construïda amb la participació de les entitats del barri. El nou espai incorpora quaranta llocs, una fonoteca pública i activitats setmanals conduïdes per artistes locals. El consistori publicarà cada trimestre les dades d’ús i reservarà una part del programa als centres educatius de la ciutat.',
    ],
    impact:
      'L’ampliació ofereix quaranta places noves i activitats culturals gratuïtes al barri.',
    ...overrides,
  }
}

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

  it('reads only publishable stories from the permanent catalog', async () => {
    const good = publishableStory()
    // La Política ja és un tema autoritzat; l'exemple de "fora" ha de ser una
    // peça de servei burocràtic, que és el que de debò queda exclòs.
    const outside = publishableStory({
      id: 'story-dades',
      url: 'https://example.com/story-dades',
      title: "Idescat actualitza les afiliacions d'autònoms per sectors",
      category: 'Dades',
      body: [
        "L'institut d'estadística ha renovat aquesta sèrie amb les xifres oficials per comarques i períodes, disponibles al portal públic per a consulta i baixada.",
      ],
      impact: 'La sèrie renovada permet seguir l’evolució amb xifres oficials.',
    })
    const db = {
      prepare() {
        return {
          bind() {
            return this
          },
          async all() {
            return {
              results: [good, outside].map((story, index) => ({
                payload_json: JSON.stringify(story),
                updated_at: `2026-07-28T10:0${index}:00.000Z`,
              })),
            }
          },
        }
      },
    }

    await expect(readEditorialStoryCatalog({ EDITORIAL_DB: db })).resolves.toMatchObject({
      available: true,
      count: 1,
      stories: [expect.objectContaining({ id: 'story-cultura', category: 'Cultura' })],
    })
  })

  it('recovers KV story copies idempotently into the permanent database', async () => {
    const story = publishableStory()
    const expiration = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
    const kv = {
      async list() {
        return {
          keys: [{ name: `story:${story.id}`, expiration }],
          list_complete: true,
        }
      },
      async get(keys) {
        return new Map(keys.map((key) => [key, story]))
      },
    }
    const batches = []
    const db = {
      prepare(query) {
        return {
          query,
          bind(...values) {
            this.values = values
            return this
          },
        }
      },
      async batch(statements) {
        batches.push(statements)
        return statements.map(() => ({ success: true }))
      },
    }

    const result = await backfillEditorialArchive({
      EDITORIAL_DB: db,
      LIVE_NEWS_KV: kv,
    })
    expect(result).toMatchObject({
      available: true,
      scanned: 1,
      accepted: 1,
      imported: 1,
      recent: 1,
      archived: 0,
    })
    expect(batches).toHaveLength(1)
    expect(batches[0][0].query).toContain('ON CONFLICT(id) DO UPDATE')
  })

  it('counts unique monthly stories rather than repeated edition entries', async () => {
    const story = publishableStory({
      firstSeenAt: '2026-07-21T08:00:00.000Z',
    })
    const db = {
      prepare() {
        return {
          bind() {
            return this
          },
          async all() {
            return {
              results: [
                {
                  payload_json: JSON.stringify(story),
                  first_seen_at: story.firstSeenAt,
                },
              ],
            }
          },
        }
      },
    }
    await expect(
      readUniqueEditorialStats({ EDITORIAL_DB: db }, new Date('2026-07-28T12:00:00Z')),
    ).resolves.toEqual({
      available: true,
      publishedUnique: 1,
      trackingSince: '2026-07-21T08:00:00.000Z',
    })
  })
})
