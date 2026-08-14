import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLiveNewsPayload } from '../liveNews.js'

// LA SINCRONITZACIÓ VA ABANS DE LES SORTIDES ANTICIPADES.
//
// El radar té diverses portes de sortida: cap font no respon, cap peça no
// arriba a tenir contingut propi... Quan la sincronització de les aprovades
// quedava DESPRÉS, una passada que sortís per qualsevol d'aquelles portes
// deixava les peces aprovades sense publicar fins vés a saber quan.
//
// Aquesta prova força el pitjor cas: cap font no respon (la ingesta no produeix
// res) i, tot i així, la peça aprovada ha d'acabar al lot públic.

function kvDeMentida(inicial) {
  const store = new Map()
  if (inicial) store.set('latest', JSON.stringify(inicial))
  return {
    store,
    async get(key, tipus) {
      const raw = store.get(key)
      if (!raw) return null
      return tipus === 'json' || tipus === undefined ? JSON.parse(raw) : raw
    },
    async put(key, value) {
      store.set(key, value)
    },
    async delete(key) {
      store.delete(key)
    },
    async list() {
      return { keys: [] }
    },
  }
}

function d1AmbUnaPendent(peca) {
  const marcades = []
  return {
    marcades,
    prepare(query) {
      return {
        query,
        values: [],
        bind(...values) {
          this.values = values
          return this
        },
        async all() {
          if (query.includes("live_state = 'pending'")) {
            return {
              results: [{ id: peca.id, payload_json: JSON.stringify(peca) }],
            }
          }
          return { results: [] }
        },
        async first() {
          return null
        },
        async run() {
          if (query.includes("live_state = 'live'")) marcades.push(this.values)
          return { meta: { changes: 1 } }
        },
      }
    },
    async batch(statements) {
      return statements.map(() => ({ meta: { changes: 0 } }))
    },
  }
}

const fetchOriginal = globalThis.fetch

beforeEach(() => {
  // Cap font no respon: la ingesta no produirà res i el radar sortirà per la
  // porta de "manté el lot tal com estava".
  globalThis.fetch = vi.fn(async () => {
    throw new Error('cap font no respon')
  })
})

afterEach(() => {
  globalThis.fetch = fetchOriginal
  vi.restoreAllMocks()
})

describe('les aprovades surten encara que el radar no trobi res', () => {
  it('publica la peça pendent i la marca, tot i la sortida anticipada', async () => {
    const jaPublicada = {
      url: 'https://example.com/vella',
      title: 'Una peça que ja era al diari',
      publishedAt: new Date().toISOString(),
    }
    const aprovada = {
      id: 'aprovada-1',
      url: 'https://example.com/aprovada',
      title: 'Peça aprovada que encara no havia sortit',
      publishedAt: new Date().toISOString(),
    }
    const kv = kvDeMentida({
      updatedAt: new Date().toISOString(),
      stories: [jaPublicada],
    })
    const db = d1AmbUnaPendent(aprovada)

    const payload = await getLiveNewsPayload(kv, {
      force: true,
      env: { EDITORIAL_DB: db },
    })

    // El radar ha sortit per la porta d'emergència...
    expect(payload.cache).toBe('stale')
    // ...però la peça aprovada ja és al lot públic desat.
    const lot = JSON.parse(kv.store.get('latest'))
    expect(lot.stories.map((s) => s.url)).toContain(aprovada.url)
    // ...la peça vella no s'ha perdut...
    expect(lot.stories.map((s) => s.url)).toContain(jaPublicada.url)
    // ...té la seva pàgina de detall...
    expect(kv.store.has(`story:${aprovada.id}`)).toBe(true)
    // ...i consta com a sincronitzada.
    expect(db.marcades.flat()).toContain(aprovada.id)
  })

  it('el que retorna el radar ja inclou la peça recuperada', async () => {
    const aprovada = {
      id: 'aprovada-2',
      url: 'https://example.com/aprovada-2',
      title: 'Una altra peça aprovada',
      publishedAt: new Date().toISOString(),
    }
    const kv = kvDeMentida({
      updatedAt: new Date().toISOString(),
      stories: [
        {
          url: 'https://example.com/vella-2',
          title: 'Peça anterior',
          publishedAt: new Date().toISOString(),
        },
      ],
    })
    const payload = await getLiveNewsPayload(kv, {
      force: true,
      env: { EDITORIAL_DB: d1AmbUnaPendent(aprovada) },
    })
    expect(payload.stories.map((s) => s.url)).toContain(aprovada.url)
  })
})
