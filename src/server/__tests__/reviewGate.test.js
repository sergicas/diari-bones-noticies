import { describe, expect, it } from 'vitest'
import {
  candidateId,
  decideCandidate,
  expireStaleCandidates,
  markStoriesLive,
  pendingLiveStories,
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

function fakeKv(initial = null, { falla = () => false } = {}) {
  const store = new Map()
  if (initial) store.set('latest', JSON.stringify(initial))
  return {
    store,
    async get(key) {
      // Un tall real de planificació entre llegir i escriure: és aquí on es
      // perdien les actualitzacions quan dues peces s'aprovaven alhora.
      await Promise.resolve()
      const raw = store.get(key)
      return raw ? JSON.parse(raw) : null
    },
    async put(key, value) {
      await Promise.resolve()
      if (falla(key)) throw new Error(`KV no ha pogut escriure ${key}`)
      store.set(key, value)
    },
    async delete(key) {
      store.delete(key)
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

  it('sense base de dades i AMB candidates, també llança', async () => {
    // L'últim racó on encara s'incomplia "el que no es desa, no es marca":
    // sense binding es tornava { recorded: 0 } i el radar continuava fins a
    // marcar-les com a vistes.
    await expect(recordPendingCandidates({}, [story()])).rejects.toThrow(
      /base de dades/,
    )
  })

  it('sense candidates a desar, no es queixa de res', async () => {
    await expect(recordPendingCandidates({}, [])).resolves.toEqual({ recorded: 0 })
  })

  it('si D1 no pot desar les candidates, LLANÇA en lloc de continuar', async () => {
    // Abans s'empassava l'error i tornava { recorded: 0 }; el radar ho ignorava
    // i marcava igualment totes les peces com a vistes, de manera que una
    // avaria transitòria buidava en silenci una passada sencera. Amb l'error
    // rellançat, el radar s'atura abans de marcar res i la cua reintenta.
    const dbAvariat = {
      prepare: (query) => ({
        query,
        bind() {
          return this
        },
        async run() {
          return { meta: { changes: 0 } }
        },
      }),
      async batch() {
        throw new Error('D1 no disponible')
      },
    }
    await expect(
      recordPendingCandidates({ EDITORIAL_DB: dbAvariat }, [story()]),
    ).rejects.toThrow(/D1 no disponible/)
  })

  it('aprovar NO toca el lot públic: només registra la decisió a D1', async () => {
    // La sala de revisió no ha d'escriure mai a KV. Mentre ho feia, hi havia
    // dos escriptors del lot públic i dues aprovacions alhora en perdien una.
    const peca = story()
    const db = fakeDb({ first: { payload_json: JSON.stringify(peca) } })
    const kv = fakeKv({ updatedAt: '2026-08-13T06:00:00Z', stories: [] })
    const escriptures = []
    kv.put = async (key) => escriptures.push(key)

    const outcome = await decideCandidate(
      { EDITORIAL_DB: db, LIVE_NEWS_KV: kv },
      'peca-1',
      'approve',
    )
    expect(outcome.ok).toBe(true)
    expect(escriptures, 'aprovar no ha de tocar KV').toEqual([])

    const update = db.calls.find((call) => call.query.includes('UPDATE'))
    expect(update.values[0]).toBe('published')
    expect(update.query).toContain('human_decision')
    expect(update.values).toContain('approve')
    // I queda a la cua de sortida, perquè el radar la publiqui.
    expect(update.values).toContain('pending')
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

  it('si el web no confirma, l’aprovació NO es desfà: queda pendent de sincronitzar', async () => {
    // Regla que va costar tres revisions d'entendre: KV té consistència
    // eventual, així que "no ho he pogut confirmar" NO vol dir "no s'ha
    // publicat". Desfer l'aprovació convertia una peça que una persona havia
    // aprovat en un esborrany que podia continuar sent públic: just la
    // inversió que aquesta porta ha d'evitar.
    const db = fakeDb({ first: { payload_json: JSON.stringify(story()) } })
    const kv = fakeKv({ stories: [] }, { falla: (key) => key === 'latest' })
    const outcome = await decideCandidate(
      { EDITORIAL_DB: db, LIVE_NEWS_KV: kv },
      'peca-1',
      'approve',
    )
    expect(outcome.ok, "l'aprovació es dona per feta").toBe(true)
    expect(outcome.live, 'però encara no confirmada al web').toBe(false)
    // Cap consulta no ha de TORNAR A POSAR l'estat a 'captured'. (La reserva
    // sí que porta 'captured' a la condició WHERE; el que no hi pot haver és
    // cap SET que hi torni.)
    const tornaEnrere = db.calls.some((c) =>
      /SET\s+editorial_status\s*=\s*'captured'/i.test(c.query),
    )
    expect(tornaEnrere, 'una aprovació humana no es desfà mai').toBe(false)
    // I queda apuntada com a pendent de sincronitzar, perquè el radar la reculli.
    const reserva = db.calls.find((c) => c.query.includes('live_state'))
    expect(reserva.values).toContain('pending')
  })

  it('dues aprovacions alhora deixen DUES peces a la cua, sense perdre’n cap', async () => {
    // El cas que Codex va reproduir. Ara no es perd res perquè cap de les dues
    // no escriu al lot: totes dues només apunten la seva decisió a D1.
    const a = story({ id: 'peca-a', url: 'https://example.com/a' })
    const b = story({ id: 'peca-b', url: 'https://example.com/b' })
    const dbA = fakeDb({ first: { payload_json: JSON.stringify(a) } })
    const dbB = fakeDb({ first: { payload_json: JSON.stringify(b) } })
    const kv = fakeKv({ stories: [] })
    const escriptures = []
    kv.put = async (key) => escriptures.push(key)

    const [ra, rb] = await Promise.all([
      decideCandidate({ EDITORIAL_DB: dbA, LIVE_NEWS_KV: kv }, 'peca-a', 'approve'),
      decideCandidate({ EDITORIAL_DB: dbB, LIVE_NEWS_KV: kv }, 'peca-b', 'approve'),
    ])
    expect(ra.ok).toBe(true)
    expect(rb.ok).toBe(true)
    expect(escriptures, 'cap de les dues no ha de tocar KV').toEqual([])
    for (const [db, nom] of [[dbA, 'peca-a'], [dbB, 'peca-b']]) {
      const update = db.calls.find((c) => c.query.includes('UPDATE'))
      expect(update.values, `${nom} ha de quedar a la cua`).toContain('pending')
    }
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

  it('el radar recull les aprovades que no van arribar al web', async () => {
    // El reintent: com que el radar és l'únic que reescriu el lot públic, és
    // ell qui recupera el que va quedar pendent de sincronitzar. Idempotent i
    // sense cap cua nova.
    const db = fakeDb({
      rows: [{ id: 'peca-1', payload_json: JSON.stringify(story()) }],
    })
    const perSincronitzar = await pendingLiveStories({ EDITORIAL_DB: db })
    expect(perSincronitzar.map((s) => s.id)).toEqual(['peca-1'])
    const consulta = db.calls.find((c) => c.query.includes('live_state'))
    expect(consulta.query).toContain("human_decision = 'approve'")
    expect(consulta.query).toContain("live_state = 'pending'")
  })

  it('marcar-les com a sincronitzades només afecta les pendents', async () => {
    const db = fakeDb()
    const outcome = await markStoriesLive({ EDITORIAL_DB: db }, ['peca-1'])
    expect(outcome.marked).toBe(3)
    const update = db.calls.find((c) => c.query.includes('UPDATE'))
    expect(update.query).toContain("live_state = 'live'")
    expect(update.query).toContain("live_state = 'pending'")
  })

  it('dona el mateix identificador que fa servir la resta del diari', () => {
    expect(candidateId({ id: 'explicit' })).toBe('explicit')
    expect(candidateId({ url: 'https://example.com/x' })).toEqual(expect.any(String))
  })
})
