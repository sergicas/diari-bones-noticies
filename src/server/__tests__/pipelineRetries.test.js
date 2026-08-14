import { afterEach, describe, expect, it, vi } from 'vitest'
import { handlePipelineBatch, MAX_INTENTS } from '../pipelineQueue.js'

// UN INTENT FALLIT NO ÉS UNA FEINA FALLIDA.
//
// Cloudflare Queues reparteix com a mínim una vegada i reintenta fins a
// `max_retries`. Marcant 'failed' al primer error, els scripts que esperaven la
// feina l'abandonaven mentre la cua encara l'havia de tornar a executar.
//
// Aquestes proves fixen el contracte: mentre quedin intents, la feina segueix
// en marxa amb l'últim error apuntat; només l'últim intent la dona per morta.

const fetchOriginal = globalThis.fetch
afterEach(() => {
  // Una prova d'aquest fitxer truca `fetch`; sense restaurar-lo, contamina la
  // següent i li fa passar el radar per un camí que no és el que prova.
  globalThis.fetch = fetchOriginal
  vi.restoreAllMocks()
})

function envQueRegistra() {
  const escrits = []
  return {
    escrits,
    LIVE_NEWS_KV: {
      async get() {
        return null
      },
      async put() {},
    },
    EDITORIAL_DB: {
      prepare(query) {
        return {
          query,
          values: [],
          bind(...values) {
            this.values = values
            return this
          },
          async first() {
            // beginPipelineJob: la feina no existeix, així que s'ha d'executar.
            return null
          },
          async run() {
            escrits.push({ query: this.query, values: this.values })
            return { meta: { changes: 1 } }
          },
          async all() {
            return { results: [] }
          },
        }
      },
      async batch(statements) {
        return statements.map(() => ({ meta: { changes: 1 } }))
      },
    },
  }
}

function missatge(attempts) {
  return {
    id: `msg-${attempts}`,
    attempts,
    body: {
      version: 1,
      type: 'refresh-edition',
      idempotencyKey: 'refresh:manual:prova',
      slot: 'manual',
      distribution: 'none',
    },
    ack: vi.fn(),
    retry: vi.fn(),
  }
}

function ultimaEscripturaDEstat(escrits) {
  return [...escrits].reverse().find((e) => e.query.includes('pipeline_jobs'))
}

async function executaAmbError(attempts) {
  const env = envQueRegistra()
  // Fem que el radar peti: sense LIVE_NEWS_KV utilitzable, getLiveNewsPayload
  // llança i la feina entra pel camí d'error.
  env.LIVE_NEWS_KV = {
    async get() {
      throw new Error('KV avariat')
    },
    async put() {
      throw new Error('KV avariat')
    },
  }
  const msg = missatge(attempts)
  await handlePipelineBatch({ queue: 'bondiari-ingest', messages: [msg] }, env)
  return { env, msg }
}

describe('reintents de la cua', () => {
  it('el primer intent fallit NO deixa la feina com a fallida', async () => {
    const { env, msg } = await executaAmbError(1)
    const estat = ultimaEscripturaDEstat(env.escrits)
    expect(estat.query).toContain("status = 'processing'")
    expect(estat.query).not.toContain("status = 'failed'")
    // Però l'error hi queda apuntat: s'està intentant, i l'últim intent va
    // anar malament. Les dues coses alhora són la veritat.
    expect(estat.query).toContain('last_error')
    expect(estat.values.join(' ')).toContain('KV avariat')
    expect(msg.retry).toHaveBeenCalled()
  })

  it('els intents del mig tampoc', async () => {
    const { env } = await executaAmbError(MAX_INTENTS - 1)
    const estat = ultimaEscripturaDEstat(env.escrits)
    expect(estat.query).toContain("status = 'processing'")
  })

  it("l'últim intent sí que la dona per fallida, amb el motiu", async () => {
    const { env } = await executaAmbError(MAX_INTENTS)
    const estat = ultimaEscripturaDEstat(env.escrits)
    expect(estat.query).toContain("status = 'failed'")
    expect(estat.values.join(' ')).toContain('KV avariat')
  })

  it('un reintent posterior que va bé la deixa completada', async () => {
    // El cas que fa que valgui la pena no mentir: el primer intent falla, el
    // segon va bé, i la feina ha d'acabar en 'completed'.
    const env = envQueRegistra()
    const lot = {
      updatedAt: '2026-08-14T06:00:00.000Z',
      stories: [
        {
          url: 'https://example.com/una',
          title: 'Una peça que ja hi era',
          publishedAt: new Date().toISOString(),
        },
      ],
    }
    env.LIVE_NEWS_KV = {
      async get(key) {
        return key === 'latest' ? lot : null
      },
      async put() {},
    }
    globalThis.fetch = vi.fn(async () => {
      throw new Error('cap font no respon')
    })

    const msg = missatge(2)
    await handlePipelineBatch({ queue: 'bondiari-ingest', messages: [msg] }, env)

    expect(msg.ack).toHaveBeenCalled()
    expect(msg.retry).not.toHaveBeenCalled()
    const estat = ultimaEscripturaDEstat(env.escrits)
    expect(estat.query).toContain("status = 'completed'")
  })

})
