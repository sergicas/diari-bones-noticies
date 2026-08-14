import { describe, expect, it } from 'vitest'
import {
  candidateId,
  decideCandidate,
  expireStaleCandidates,
  readDecisions,
  recordPendingCandidates,
  splitByReviewDecision,
} from '../reviewGate.js'

function story(overrides = {}) {
  return {
    id: 'peca-1',
    url: 'https://example.com/peca-1',
    title: 'Una bona notícia qualsevol',
    source: 'Font de prova',
    category: 'Ciència',
    language: 'ca',
    ...overrides,
  }
}

function fakeDb({ rows = [], first = null, changes = 3 } = {}) {
  const calls = []
  const statement = (query) => ({
    query,
    values: [],
    bind(...values) {
      this.values = values
      return this
    },
    async all() {
      calls.push({ query: this.query, values: this.values })
      return { results: rows }
    },
    async first() {
      calls.push({ query: this.query, values: this.values })
      return first
    },
    async run() {
      calls.push({ query: this.query, values: this.values })
      return { success: true, meta: { changes } }
    },
  })
  return {
    calls,
    prepare: (query) => statement(query),
    async batch(statements) {
      for (const item of statements) {
        calls.push({ query: item.query, values: item.values })
      }
      return statements.map(() => ({ meta: { changes: 1 } }))
    },
  }
}

function fakeKv(initial = null) {
  const store = new Map()
  if (initial) store.set('latest', JSON.stringify(initial))
  return {
    store,
    async get(key) {
      const raw = store.get(key)
      return raw ? JSON.parse(raw) : null
    },
    async put(key, value) {
      store.set(key, value)
    },
  }
}

describe('porta d’aprovació humana', () => {
  it('no deixa publicar cap peça nova sense una decisió explícita', () => {
    const stories = [story(), story({ id: 'peca-2', url: 'https://example.com/peca-2' })]
    const { approved, pending, rejected } = splitByReviewDecision(stories)
    expect(approved).toHaveLength(0)
    expect(pending).toHaveLength(2)
    expect(rejected).toHaveLength(0)
  })

  it('manté les peces que ja eren públiques encara que no hi hagi decisió desada', () => {
    // Si la base de dades no respon, les novetats s'aturen però el diari d'ahir
    // ha de continuar dret: en cas contrari desapareixerien del web enllaços
    // que Google ja té indexats.
    const vella = story({ id: 'ja-publica', url: 'https://example.com/ja-publica' })
    const nova = story({ id: 'nova', url: 'https://example.com/nova' })
    const { approved, pending } = splitByReviewDecision([vella, nova], {
      decisions: new Map(),
      publicUrls: new Set([vella.url]),
    })
    expect(approved.map((s) => s.id)).toEqual(['ja-publica'])
    expect(pending.map((s) => s.id)).toEqual(['nova'])
  })

  it('deixa passar les aprovades i tanca les descartades', () => {
    const si = story({ id: 'si', url: 'https://example.com/si' })
    const no = story({ id: 'no', url: 'https://example.com/no' })
    const espera = story({ id: 'espera', url: 'https://example.com/espera' })
    const { approved, pending, rejected } = splitByReviewDecision([si, no, espera], {
      decisions: new Map([
        ['si', { status: 'published', humanDecision: 'approve' }],
        ['no', { status: 'rejected', humanDecision: 'reject' }],
      ]),
    })
    expect(approved.map((s) => s.id)).toEqual(['si'])
    expect(rejected.map((s) => s.id)).toEqual(['no'])
    expect(pending.map((s) => s.id)).toEqual(['espera'])
  })

  it('una peça publicada pel robot ANTIC no es dona per aprovada', () => {
    // D1 porta 209 peces publicades abans que existís cap revisió humana. Si
    // una es torna a recollir, ha de passar per la sala com qualsevol altra:
    // val més fer llegir dues vegades una peça bona que publicar-ne una que
    // ningú no ha llegit mai.
    const vella = story({ id: 'de-labans', url: 'https://example.com/de-labans' })
    const { approved, pending } = splitByReviewDecision([vella], {
      decisions: new Map([['de-labans', { status: 'published', humanDecision: null }]]),
    })
    expect(approved).toHaveLength(0)
    expect(pending.map((s) => s.id)).toEqual(['de-labans'])
  })

  it('tampoc si consta com a arxivada o distribuïda sense marca humana', () => {
    for (const status of ['archived', 'distributed']) {
      const { approved, pending } = splitByReviewDecision(
        [story({ id: 'x', url: 'https://example.com/x' })],
        { decisions: new Map([['x', { status, humanDecision: null }]]) },
      )
      expect(approved, `${status} no hauria de passar sol`).toHaveLength(0)
      expect(pending).toHaveLength(1)
    }
  })

  it('sense base de dades no inventa cap aprovació', async () => {
    const decisions = await readDecisions({}, ['peca-1', 'peca-2'])
    expect(decisions.size).toBe(0)
    const { approved, pending } = splitByReviewDecision([story()], { decisions })
    expect(approved).toHaveLength(0)
    expect(pending).toHaveLength(1)
  })

  it('desa les candidates com a pendents sense trepitjar decisions ja preses', async () => {
    const db = fakeDb()
    const outcome = await recordPendingCandidates({ EDITORIAL_DB: db }, [story()])
    expect(outcome.recorded).toBe(1)
    const insert = db.calls.find((call) => call.query.includes('INSERT'))
    expect(insert.query).toContain('INSERT OR IGNORE')
    expect(insert.query).toContain("'captured'")
  })

  it('aprovar una peça la publica i la posa de seguida al lot en viu', async () => {
    const peca = story()
    const db = fakeDb({ first: { payload_json: JSON.stringify(peca) } })
    const kv = fakeKv({ updatedAt: '2026-08-13T06:00:00Z', stories: [] })
    const outcome = await decideCandidate(
      { EDITORIAL_DB: db, LIVE_NEWS_KV: kv },
      'peca-1',
      'approve',
    )
    expect(outcome.ok).toBe(true)
    expect(outcome.live).toBe(true)
    const update = db.calls.find((call) => call.query.includes('UPDATE'))
    expect(update.values[0]).toBe('published')
    // Deixa rastre que ho ha decidit una PERSONA: sense això seria
    // indistingible d'una peça publicada per l'automatisme antic.
    expect(update.query).toContain('human_decision')
    expect(update.values).toContain('approve')
    const lot = JSON.parse(kv.store.get('latest'))
    expect(lot.stories.map((s) => s.url)).toContain(peca.url)
    expect(kv.store.has('story:peca-1')).toBe(true)
  })

  it('descartar una peça no la publica enlloc', async () => {
    const peca = story()
    const db = fakeDb({ first: { payload_json: JSON.stringify(peca) } })
    const kv = fakeKv({ updatedAt: '2026-08-13T06:00:00Z', stories: [] })
    const outcome = await decideCandidate(
      { EDITORIAL_DB: db, LIVE_NEWS_KV: kv },
      'peca-1',
      'reject',
    )
    expect(outcome.ok).toBe(true)
    const update = db.calls.find((call) => call.query.includes('UPDATE'))
    expect(update.values[0]).toBe('rejected')
    const lot = JSON.parse(kv.store.get('latest'))
    expect(lot.stories).toHaveLength(0)
    expect(kv.store.has('story:peca-1')).toBe(false)
  })

  it('si algú altre ha decidit primer, no diu que l’ha publicada', async () => {
    // Dues pestanyes obertes, dues decisions alhora. La condició de la
    // consulta fa d'exclusió mútua: la segona no canvia cap fila (changes = 0)
    // i ha de dir-ho, en lloc d'assegurar que s'ha publicat.
    const db = fakeDb({ first: { payload_json: JSON.stringify(story()) }, changes: 0 })
    const outcome = await decideCandidate(
      { EDITORIAL_DB: db, LIVE_NEWS_KV: fakeKv({ stories: [] }) },
      'peca-1',
      'approve',
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toBe('not-pending')
  })

  it('si la peça no arriba al web, es desfà l’aprovació i torna a la sala', async () => {
    // Tot o res: deixar-la marcada com a publicada seria pitjor que no fer
    // res, perquè la pantalla diria que sí, la peça no sortiria enlloc i ja no
    // es podria tornar a aprovar.
    const db = fakeDb({ first: { payload_json: JSON.stringify(story()) } })
    const kvAvariat = {
      async get() {
        return { stories: [] }
      },
      async put() {
        throw new Error('KV no disponible')
      },
    }
    const outcome = await decideCandidate(
      { EDITORIAL_DB: db, LIVE_NEWS_KV: kvAvariat },
      'peca-1',
      'approve',
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toBe('not-published')
    const desfet = db.calls.filter((c) => c.query.includes('UPDATE')).pop()
    expect(desfet.query).toContain("'captured'")
    expect(desfet.query).toContain('human_decision = NULL')
  })

  it('no accepta cap decisió que no sigui publicar o descartar', async () => {
    const outcome = await decideCandidate(
      { EDITORIAL_DB: fakeDb() },
      'peca-1',
      'publica-ho-tot',
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toBe('unknown-decision')
  })

  it('només decideix sobre peces que encara esperen', async () => {
    const db = fakeDb({ first: null })
    const outcome = await decideCandidate({ EDITORIAL_DB: db }, 'ja-decidida', 'approve')
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toBe('not-pending')
  })

  it('caduca les pendents als set dies', async () => {
    const db = fakeDb()
    const now = Date.parse('2026-08-13T12:00:00Z')
    const outcome = await expireStaleCandidates({ EDITORIAL_DB: db }, { now })
    expect(outcome.expired).toBe(3)
    const update = db.calls.find((call) => call.query.includes('UPDATE'))
    expect(update.query).toContain("'rejected'")
    // 'expired', no 'reject': caducar no és el mateix que llegir-la i dir que no.
    expect(update.query).toContain("human_decision = 'expired'")
    expect(update.values[1]).toBe('2026-08-06T12:00:00.000Z')
  })

  it('dona el mateix identificador que fa servir la resta del diari', () => {
    expect(candidateId({ id: 'explicit' })).toBe('explicit')
    expect(candidateId({ url: 'https://example.com/x' })).toEqual(expect.any(String))
  })
})
