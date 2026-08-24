import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { passadaDeLAjudant } from '../assistantPass.js'
import { getLiveNewsPayload } from '../liveNews.js'

// LA PORTA ÚNICA DE PUBLICACIÓ.
//
// Tot el que arriba al web hi passa per un sol lloc, `tancaEdicio`. Aquestes
// proves recorren el camí sencer —radar, ajudant, lot públic— i fixen el que
// no pot passar mai:
//
//   1. Material intern (la còpia de la font que fa servir l'ajudant) escrit
//      al lot públic o a la pàgina d'una peça.
//   2. Una peça retirada que torna a aparèixer perquè la mateixa passada li
//      reescriu la pàgina tot seguit d'esborrar-la.
//   3. Una peça marcada com a "retirada" quan de fet no s'ha pogut esborrar.
//   4. L'ajudant tocant res amb un mode que no sigui exactament `auto`.
//
// Cadascuna d'aquestes va ser un error real, no una hipòtesi.

function kvDeMentida(inicial) {
  const store = new Map()
  if (inicial) store.set('latest', JSON.stringify(inicial))
  const esborrats = []
  return {
    store,
    esborrats,
    falladaEnEsborrar: false,
    async get(key, tipus) {
      const raw = store.get(key)
      if (!raw) return null
      return tipus === 'json' || tipus === undefined ? JSON.parse(raw) : raw
    },
    async put(key, value) {
      store.set(key, value)
    },
    async delete(key) {
      if (this.falladaEnEsborrar) throw new Error('KV no respon')
      esborrats.push(key)
      store.delete(key)
    },
    async list() {
      return { keys: [] }
    },
  }
}

/** Una peça vàlida que passaria totes les barreres de qualitat. */
function peca(id, extra = {}) {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Una notícia constructiva ben escrita sobre el cel de ${id}`,
    category: 'Astronomia',
    topic: 'Astronomia',
    source: 'Font de prova',
    language: 'ca',
    ownContent: true,
    editorialFormat: 'constructive',
    publishedAt: new Date().toISOString(),
    body: [
      'La institució ha presentat aquesta setmana un programa amb quaranta places noves i dades públiques trimestrals. El projecte incorpora formació, seguiment i una avaluació independent que es publicarà cada any. Les entitats del barri hi participen des del primer dia i el calendari preveu una revisió al cap de dotze mesos.',
    ],
    impact: 'Ofereix quaranta places noves i dades públiques per comprovar-ne els resultats.',
    ...extra,
  }
}

/**
 * Una D1 de mentida que respon les consultes que fa el radar i deixa constància
 * de les escriptures, perquè les proves puguin mirar QUÈ s'ha marcat.
 */
function d1({ pendents = [], retirades = [], canvisPerId = null } = {}) {
  const escriptures = []
  // `canvisPerId` reprodueix el cas real: un UPDATE condicionat que no toca
  // cap fila perquè algú ha decidit abans.
  const canvisDe = (values) => {
    if (!canvisPerId) return 1
    const id = values.find((v) => v in canvisPerId)
    return id === undefined ? 1 : canvisPerId[id]
  }
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
          if (query.includes("withdrawal = 'pending'")) return { results: retirades }
          if (query.includes("live_state = 'pending'")) {
            return {
              results: pendents.map((p) => ({ id: p.id, payload_json: JSON.stringify(p) })),
            }
          }
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
      return statements.map((s) => ({ meta: { changes: canvisDe(s.values || []) } }))
    },
  }
}

const fetchOriginal = globalThis.fetch

beforeEach(() => {
  // Cap font no respon: així la prova aïlla el camí de publicació i no depèn
  // de cap xarxa.
  globalThis.fetch = vi.fn(async () => {
    throw new Error('cap font no respon')
  })
})

afterEach(() => {
  globalThis.fetch = fetchOriginal
  vi.restoreAllMocks()
})

function contingutDe(kv) {
  return [...kv.store.entries()].map(([clau, valor]) => ({ clau, valor }))
}

describe('el material intern no arriba mai al web', () => {
  it("no és ni al lot ni a la pàgina de la peça, ni quan l'aprova l'ajudant sol", async () => {
    const pendent = peca('amb-font', {
      reviewSourceContext: 'THE ORIGINAL ENGLISH SOURCE TEXT, WORD FOR WORD.',
      reviewSourceTitle: 'Original English headline',
      possibleDuplicateOf: 'una-altra',
    })
    const kv = kvDeMentida({ stories: [], updatedAt: new Date().toISOString() })
    const base = d1({ pendents: [pendent] })

    await getLiveNewsPayload(kv, {
      force: true,
      env: {
        EDITORIAL_DB: base,
        ASSISTANT_MODE: 'off',
        REVIEW_PASSWORD: 'x',
      },
    })

    const escrit = contingutDe(kv)
    expect(escrit.some((e) => e.clau === 'latest')).toBe(true)
    for (const { clau, valor } of escrit) {
      expect(valor, `${clau} conté la font original`).not.toContain('WORD FOR WORD')
      expect(valor, `${clau} conté el titular original`).not.toContain('Original English')
      expect(valor, `${clau} conté material de treball`).not.toContain('possibleDuplicateOf')
    }
    // I la peça hi és de debò: la prova no passa perquè no s'hagi publicat res.
    const lot = await kv.get('latest')
    expect(lot.stories.some((s) => s.id === 'amb-font')).toBe(true)
    expect(kv.store.has('story:amb-font')).toBe(true)
  })
})

describe('una peça retirada se’n va, i no torna', () => {
  it('la mateixa passada no li torna a escriure la pàgina', async () => {
    const retirada = peca('retirada-1')
    const kv = kvDeMentida({
      stories: [retirada],
      updatedAt: new Date().toISOString(),
    })
    kv.store.set('story:retirada-1', JSON.stringify(retirada))
    // El pitjor cas: la mateixa peça és a la llista de retirades I a la de
    // pendents de sincronitzar. Abans, s'esborrava i es tornava a escriure.
    const base = d1({
      pendents: [retirada],
      retirades: [{ id: 'retirada-1', url: retirada.url }],
    })

    await getLiveNewsPayload(kv, {
      force: true,
      env: {
        EDITORIAL_DB: base,
        ASSISTANT_MODE: 'off',
        REVIEW_PASSWORD: 'x',
      },
    })

    expect(kv.store.has('story:retirada-1')).toBe(false)
    const lot = await kv.get('latest')
    expect(lot.stories.some((s) => s.id === 'retirada-1')).toBe(false)
    const marcades = base.escriptures.filter((e) => e.query.includes("'withdrawn'"))
    expect(marcades).toHaveLength(1)
  })

  it("si no s'ha pogut esborrar, no es marca com a retirada", async () => {
    const retirada = peca('retirada-2')
    const kv = kvDeMentida({ stories: [retirada], updatedAt: new Date().toISOString() })
    kv.store.set('story:retirada-2', JSON.stringify(retirada))
    kv.falladaEnEsborrar = true
    const base = d1({ retirades: [{ id: 'retirada-2', url: retirada.url }] })

    await getLiveNewsPayload(kv, {
      force: true,
      env: {
        EDITORIAL_DB: base,
        ASSISTANT_MODE: 'off',
        REVIEW_PASSWORD: 'x',
      },
    })

    // L'ordre segueix pendent: es tornarà a intentar. Marcar-la hauria deixat
    // una peça "retirada" amb la pàgina encara oberta al públic.
    const marcades = base.escriptures.filter((e) => e.query.includes("'withdrawn'"))
    expect(marcades).toHaveLength(0)
  })
})

describe('el mode de l’ajudant falla tancat', () => {
  // Es prova el mòdul directament: dins del radar, aquest tros només
  // s'exercitava muntant fonts i IA, i és el que decideix si una peça es
  // publica sense que ningú la miri.
  const modesQueNoDecideixen = ['shadow', 'Auto', 'auto ', 'automatic', '', 'true', 'AUTO']

  for (const mode of modesQueNoDecideixen) {
    it(`amb ASSISTANT_MODE="${mode}" no decideix res sol`, async () => {
      const base = d1()
      const ai = { run: vi.fn(async () => ({ response: 'VEREDICTE: publicar · MOTIU: bona' })) }

      const out = await passadaDeLAjudant(
        { EDITORIAL_DB: base, AI: ai, ASSISTANT_MODE: mode },
        [peca('candidata', { reviewSourceContext: 'A source about the sky.' })],
      )

      expect(out.aprovades, `el mode "${mode}" ha publicat sol`).toHaveLength(0)
      const decisions = base.escriptures.filter((e) => e.query.includes('auto_decision'))
      expect(decisions, `el mode "${mode}" ha escrit una decisió`).toHaveLength(0)
    })
  }

  it('amb "off" no crida ni la IA', async () => {
    const ai = { run: vi.fn() }
    const out = await passadaDeLAjudant({ EDITORIAL_DB: d1(), AI: ai, ASSISTANT_MODE: 'off' }, [
      peca('candidata'),
    ])
    expect(out.aprovades).toHaveLength(0)
    expect(ai.run).not.toHaveBeenCalled()
  })

  it('en ombra desa un veredicte de cada candidata, dubtes inclosos', async () => {
    const base = d1()
    const ai = { run: vi.fn(async () => ({ response: 'VEREDICTE: publicar · MOTIU: bona' })) }

    await passadaDeLAjudant({ EDITORIAL_DB: base, AI: ai, ASSISTANT_MODE: 'shadow' }, [
      peca('neta', { reviewSourceContext: 'A source about the sky.' }),
      // Salut: la guàrdia de matèries delicades la deixa en dubte.
      peca('sensible', {
        title: 'Un assaig clínic millora la vida dels pacients amb càncer',
        reviewSourceContext: 'A clinical trial improves the lives of cancer patients.',
      }),
    ])

    const ombra = base.escriptures.filter((e) => e.query.includes('shadow_decision'))
    expect(ombra).toHaveLength(2)
    expect(ombra.some((e) => e.values.includes('doubt'))).toBe(true)
  })

  it('en auto només publica el que D1 ha acceptat de debò', async () => {
    // La peça que l'UPDATE no toca (changes = 0) no entra al lot: una persona
    // pot haver-la rebutjat un segon abans.
    const base = d1({ canvisPerId: { acceptada: 1, refusada: 0 } })
    const ai = { run: vi.fn(async () => ({ response: 'VEREDICTE: publicar · MOTIU: bona' })) }

    const out = await passadaDeLAjudant({ EDITORIAL_DB: base, AI: ai, ASSISTANT_MODE: 'auto' }, [
      peca('acceptada', { reviewSourceContext: 'A source about the sky.' }),
      peca('refusada', { reviewSourceContext: 'A source about the sky.' }),
    ])

    expect(out.aprovades.map((s) => s.id)).toEqual(['acceptada'])
  })

  it('si la sala no respon, no publica res', async () => {
    const base = {
      prepare() {
        throw new Error('D1 caiguda')
      },
    }
    const ai = { run: vi.fn(async () => ({ response: 'VEREDICTE: publicar · MOTIU: bona' })) }
    const out = await passadaDeLAjudant({ EDITORIAL_DB: base, AI: ai, ASSISTANT_MODE: 'auto' }, [
      peca('candidata', { reviewSourceContext: 'A source.' }),
    ])
    expect(out.aprovades).toHaveLength(0)
  })
})
