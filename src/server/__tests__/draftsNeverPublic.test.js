import { describe, expect, it } from 'vitest'
import { findStoryInEditorialStore } from '../editorialStore.js'
import { findStory } from '../storyMeta.js'

// LA PORTA D'APROVACIÓ TENIA UNA ESCLETXA PÚBLICA (14-08-2026).
//
// `findStoryInEditorialStore` filtrava amb llista NEGRA (`!= 'rejected'`), i
// això deixava passar les peces en estat `captured`: qualsevol esborrany
// pendent de revisió era llegible per /noticia/:id abans que ningú l'aprovés.
//
// Aquestes proves fixen el contracte: un estat que no sigui explícitament
// públic NO es serveix mai. Si algú hi torna a posar una llista negra, o si
// s'inventa un estat nou, aquestes proves han de petar.

// Una D1 de mentida que aplica de debò la clàusula de la consulta, en lloc de
// tornar sempre la fila. Si no, la prova passaria amb el codi vell.
function d1Amb(fila) {
  return {
    prepare(query) {
      return {
        bind() {
          return this
        },
        async first() {
          const permesos = [...query.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
          const negada = /!=\s*'([a-z]+)'/.exec(query)?.[1]
          const passa = negada
            ? fila.editorial_status !== negada
            : permesos.includes(fila.editorial_status)
          return passa ? { payload_json: JSON.stringify(fila.payload) } : null
        },
        async all() {
          return { results: [] }
        },
        async run() {
          return { meta: { changes: 0 } }
        },
      }
    },
  }
}

const esborrany = {
  editorial_status: 'captured',
  payload: { id: 'esborrany-1', title: 'Peça que ningú no ha aprovat encara' },
}
const aprovada = {
  editorial_status: 'published',
  payload: { id: 'aprovada-1', title: 'Peça aprovada per una persona' },
}

const kvBuit = {
  async get() {
    return null
  },
}

describe('els esborranys no són mai públics', () => {
  it('una peça pendent de revisió no es serveix', async () => {
    const out = await findStoryInEditorialStore(
      { EDITORIAL_DB: d1Amb(esborrany) },
      'esborrany-1',
    )
    expect(out).toBeNull()
  })

  it('una peça descartada tampoc', async () => {
    const out = await findStoryInEditorialStore(
      { EDITORIAL_DB: d1Amb({ ...esborrany, editorial_status: 'rejected' }) },
      'esborrany-1',
    )
    expect(out).toBeNull()
  })

  it('una peça aprovada sí que es serveix', async () => {
    const out = await findStoryInEditorialStore(
      { EDITORIAL_DB: d1Amb(aprovada) },
      'aprovada-1',
    )
    expect(out?.title).toBe('Peça aprovada per una persona')
  })

  it("l'hemeroteca segueix accessible", async () => {
    for (const estat of ['distributed', 'archived']) {
      const out = await findStoryInEditorialStore(
        { EDITORIAL_DB: d1Amb({ ...aprovada, editorial_status: estat }) },
        'aprovada-1',
      )
      expect(out, `l'estat ${estat} hauria de ser públic`).not.toBeNull()
    }
  })

  it('la pàgina /noticia/:id no troba un esborrany', async () => {
    // Camí complet: KV buit (les pendents no tenen còpia a KV) i D1 amb la
    // peça en espera. Ha de resoldre a "no existeix", que és el que fa el 404.
    const story = await findStory('esborrany-1', {
      LIVE_NEWS_KV: kvBuit,
      EDITORIAL_DB: d1Amb(esborrany),
    })
    expect(story).toBeNull()
  })
})
