import { describe, expect, it, vi } from 'vitest'
import { passadaDeLAjudant } from '../assistantPass.js'
import { persistEditorialEdition, readEditionStories } from '../editorialStore.js'
import { sendDailyDigest } from '../newsletter.js'
import { renderStoryPage } from '../storyMeta.js'
import {
  candidateId,
  decideCandidate,
  recordPendingCandidates,
  senseVetades,
  splitByReviewDecision,
} from '../reviewGate.js'

// LA DECISIÓ D'UNA PERSONA MANA SOBRE LA MÀQUINA, SEMPRE.
//
// Codex va reproduir dues maneres que tenia el sistema de desdir-se'n:
//
//   1. L'ajudant i la sala calculaven identificadors DIFERENTS per a la
//      mateixa peça. Les peces reals dels feeds no porten `id`; la sala en
//      fabrica un (`feed-…`) i l'ajudant feia servir l'adreça. Tots els seus
//      UPDATE anaven a una fila que no existia: en ombra no es desava cap
//      veredicte i en automàtic no s'aprovava mai res, mentre el registre deia
//      que sí. Les proves d'abans no ho veien perquè hi posaven l'`id` a mà.
//
//   2. Un rebuig humà es podia desfer sol: l'arxiu d'edicions reescrivia la
//      fila com a publicada, i el repartiment donava per bona una aprovació de
//      l'ajudant encara que una persona l'hagués rebutjada després.

/** Una peça tal com arriba d'un feed: SENSE `id`. Aquesta era la clau. */
function pecaDeFeed(url = 'https://example.org/notícia-real-del-feed') {
  return {
    url,
    title: 'Un observatori nou permet reconstruir el cel de fa mil·lennis',
    category: 'Astronomia',
    topic: 'Astronomia',
    source: 'Font de prova',
    language: 'ca',
    body: ['Un text prou llarg per passar per candidata a la sala de revisió.'],
    reviewSourceContext: 'A new observatory lets astronomers reconstruct ancient skies.',
  }
}

function d1Espia() {
  const escriptures = []
  return {
    escriptures,
    prepare(query) {
      return {
        query,
        values: [],
        bind(...values) {
          this.values = values
          return this
        },
        async all() {
          return { results: [] }
        },
        async first() {
          return null
        },
        async run() {
          escriptures.push({ query, values: this.values })
          return { meta: { changes: 1 } }
        },
      }
    },
    async batch(statements) {
      for (const s of statements) escriptures.push({ query: s.query, values: s.values })
      return statements.map(() => ({ meta: { changes: 1 } }))
    },
  }
}

describe('la sala i l’ajudant parlen de la mateixa peça', () => {
  it('una peça de feed sense id rep el MATEIX identificador als dos costats', async () => {
    const story = pecaDeFeed()
    expect(story.id, 'la prova ha de fer servir una peça sense id').toBeUndefined()

    const sala = d1Espia()
    await recordPendingCandidates({ EDITORIAL_DB: sala }, [story])

    const ajudant = d1Espia()
    await passadaDeLAjudant(
      {
        EDITORIAL_DB: ajudant,
        AI: { run: async () => ({ response: 'VEREDICTE: publicar · MOTIU: bona' }) },
        ASSISTANT_MODE: 'shadow',
      },
      [story],
    )

    const idSala = sala.escriptures[0].values[0]
    const idAjudant = ajudant.escriptures[0].values.at(-1)
    expect(idSala).toBe(candidateId(story))
    expect(idAjudant).toBe(idSala)
    // I no és l'adreça, que és el que hi posava abans.
    expect(idAjudant).not.toBe(story.url)
    expect(String(idAjudant).startsWith('feed-')).toBe(true)
  })

  it('en automàtic, l’aprovació apunta a la fila que existeix', async () => {
    const story = pecaDeFeed('https://example.org/una-altra-de-feed')
    const base = d1Espia()
    const out = await passadaDeLAjudant(
      {
        EDITORIAL_DB: base,
        AI: { run: async () => ({ response: 'VEREDICTE: publicar · MOTIU: bona' }) },
        ASSISTANT_MODE: 'auto',
      },
      [story],
    )
    expect(out.aprovades).toHaveLength(1)
    const decisio = base.escriptures.find((e) => e.query.includes('auto_decision'))
    expect(decisio.values.at(-1)).toBe(candidateId(story))
  })
})

describe('un rebuig humà no el desfà ningú', () => {
  const story = { id: 'peca-1', url: 'https://example.com/peca-1', title: 'Una peça' }

  it('guanya a l’aprovació de l’ajudant', () => {
    const decisions = new Map([
      ['peca-1', { status: 'published', humanDecision: 'reject', autoDecision: 'approve' }],
    ])
    const out = splitByReviewDecision([story], { decisions })
    expect(out.approved).toHaveLength(0)
    expect(out.rejected).toHaveLength(1)
  })

  it('guanya fins i tot si la peça ja era pública', () => {
    // La drecera de "ja era al lot" es feia abans de mirar cap decisió, i una
    // peça rebutjada seguia sortint mentre fos al lot d'ahir.
    const decisions = new Map([
      ['peca-1', { status: 'published', humanDecision: 'reject', autoDecision: 'approve' }],
    ])
    const out = splitByReviewDecision([story], {
      decisions,
      publicUrls: new Set([story.url]),
    })
    expect(out.approved).toHaveLength(0)
  })

  it('una ordre de retirada també la treu del lot', () => {
    const decisions = new Map([
      ['peca-1', { status: 'published', humanDecision: 'approve', withdrawal: 'pending' }],
    ])
    const out = splitByReviewDecision([story], {
      decisions,
      publicUrls: new Set([story.url]),
    })
    expect(out.approved).toHaveLength(0)
    expect(out.rejected).toHaveLength(1)
  })

  it('i una aprovació humana normal segueix publicant', () => {
    const decisions = new Map([
      ['peca-1', { status: 'published', humanDecision: 'approve', autoDecision: null }],
    ])
    expect(splitByReviewDecision([story], { decisions }).approved).toHaveLength(1)
  })
})

describe('l’arxiu d’edicions no pot ressuscitar una peça', () => {
  it('la consulta que llegeix una edició deixa fora retirades i rebutjades', async () => {
    let consulta = ''
    const db = {
      prepare(query) {
        consulta = query
        return {
          bind() {
            return this
          },
          async all() {
            return { results: [] }
          },
        }
      },
    }
    await readEditionStories({ EDITORIAL_DB: db }, 'edicio-1')
    expect(consulta).toContain("COALESCE(stories.human_decision, '') <> 'reject'")
    expect(consulta).toContain("COALESCE(stories.withdrawal, '') = ''")
  })
})

describe('el que s’ha retirat no s’envia a ningú', () => {
  const peces = [
    { id: 'bona', url: 'https://example.com/bona', title: 'Una peça bona' },
    { id: 'retirada', url: 'https://example.com/retirada', title: 'Una peça retirada' },
  ]

  function d1AmbVeto(vetades) {
    return {
      prepare(query) {
        return {
          bind(...values) {
            this.values = values
            return this
          },
          async all() {
            if (!query.includes('withdrawal IS NOT NULL')) return { results: [] }
            return {
              results: (this.values || [])
                .filter((v) => vetades.includes(v))
                .map((id) => ({ id })),
            }
          },
        }
      },
    }
  }

  it('senseVetades treu la retirada i deixa la bona', async () => {
    const out = await senseVetades({ EDITORIAL_DB: d1AmbVeto(['retirada']) }, peces)
    expect(out.map((s) => s.id)).toEqual(['bona'])
  })

  it('si la sala no respon, llança en lloc d’enviar-ho tot', async () => {
    const trencada = {
      prepare() {
        throw new Error('D1 caiguda')
      },
    }
    await expect(senseVetades({ EDITORIAL_DB: trencada }, peces)).rejects.toThrow()
    // I sense base de dades, tampoc no dona per bo el lot.
    await expect(senseVetades({}, peces)).rejects.toThrow()
  })

  it('el butlletí no surt si l’única peça del dia està retirada', async () => {
    const kv = {
      async get() {
        return { stories: [peces[1]] }
      },
    }
    const enviats = vi.fn()
    const out = await sendDailyDigest({
      LIVE_NEWS_KV: kv,
      EDITORIAL_DB: d1AmbVeto(['retirada']),
      RESEND_API_KEY: 'no-s-ha-d-arribar-a-fer-servir',
      fetch: enviats,
    })
    expect(out.skipped).toBe(true)
    expect(out.sent).toBe(0)
    expect(enviats).not.toHaveBeenCalled()
  })
})

describe('quan no es pot comprovar el veto, no se serveix res', () => {
  it('la pàgina d’una notícia respon 503 i sense indexar', async () => {
    const env = {
      LIVE_NEWS_KV: {
        async get() {
          return { stories: [{ id: 'peca-1', title: 'Una peça', url: 'https://e.com/1' }] }
        },
      },
      // La sala no respon: no se sap si algú l'ha manada retirar.
      EDITORIAL_DB: {
        prepare() {
          throw new Error('D1 caiguda')
        },
      },
    }
    const res = await renderStoryPage(
      new Request('https://bondiari.com/noticia/peca-1'),
      env,
    )
    expect(res.status).toBe(503)
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    expect(res.headers.get('retry-after')).toBeTruthy()
  })
})

describe('la retirada i la decisió van en el MATEIX UPDATE', () => {
  it('una sola consulta grava el rebuig i l’ordre de retirar', async () => {
    // Fer-ho en dues consultes deixava un forat: si la segona fallava, la peça
    // quedava rebutjada però pública, i un segon intent ja no la recuperava.
    const escriptures = []
    const db = {
      prepare(query) {
        return {
          query,
          values: [],
          bind(...values) {
            this.values = values
            return this
          },
          async first() {
            return {
              payload_json: '{}',
              url: 'https://e.com/1',
              auto_decision: 'approve',
            }
          },
          async run() {
            escriptures.push({ query, values: this.values })
            return { meta: { changes: 1 } }
          },
        }
      },
    }
    const out = await decideCandidate({ EDITORIAL_DB: db }, 'peca-1', 'reject')
    expect(out.ok).toBe(true)
    expect(out.retirada).toBe(true)
    const updates = escriptures.filter((e) => e.query.includes('UPDATE stories'))
    expect(updates).toHaveLength(1)
    expect(updates[0].query).toContain('withdrawal')
    expect(updates[0].values).toContain('pending')
  })
})

describe('l’upsert d’una edició no toca una fila vetada', () => {
  it('la condició del ON CONFLICT hi és', async () => {
    const consultes = []
    const db = {
      prepare(query) {
        consultes.push(query)
        return {
          bind() {
            return this
          },
          async run() {
            return { meta: { changes: 1 } }
          },
        }
      },
      async batch(statements) {
        return statements.map(() => ({ meta: { changes: 1 } }))
      },
    }
    await persistEditorialEdition(
      { EDITORIAL_DB: db },
      { updatedAt: new Date().toISOString(), stories: [{ id: 'peca-1', title: 'Una peça' }] },
    )
    const upsert = consultes.find((q) => q.includes('INSERT INTO stories'))
    expect(upsert).toContain("COALESCE(stories.human_decision, '') <> 'reject'")
    expect(upsert).toContain("COALESCE(stories.withdrawal, '') = ''")
  })
})
