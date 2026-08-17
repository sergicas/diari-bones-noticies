import { describe, expect, it, vi } from 'vitest'
import {
  MAX_PER_PASSADA_DEFECTE,
  passadaDeLAjudant,
  resolAbast,
  resolSostre,
} from '../assistantPass.js'

// EL TALLAFOC DE L'AUTOMATISME.
//
// Des del 17-08-2026 l'ajudant publica sol i sense cap àmbit reservat. Amb la
// revisió humana fora, l'única cosa que impedeix que una avaria de l'IA ompli
// el diari en una nit és el sostre de peces per passada.
//
// La regla que fixen aquestes proves: el sostre AJORNA, no descarta. Una peça
// que no hi cap avui s'ha de tornar a mirar demà, sense cap marca. Un límit que
// descartés seria una censura silenciosa, que és exactament el tipus d'error
// que aquest projecte ha anat perseguint tot el temps.

function candidata(i, decisio = 'publicar') {
  return {
    id: `feed-${i}`,
    url: `https://exemple.org/${i}`,
    title: `Peça ${i}`,
    topic: 'Astronomia',
    body: ['Un cos qualsevol.'],
    reviewSourceContext: `Source material for story ${i}.`,
    _decisio: decisio,
  }
}

// D1 de mentida que es comporta com el de debò en el que aquí importa:
// `recordAssistantDecisions` construeix sentències amb `prepare().bind()` i les
// executa amb `db.batch()`. Es desa l'últim paràmetre de cada UPDATE, que és
// l'identificador de la peça tocada.
function entorn(candidates, { mode = 'auto', abast = 'all', sostre } = {}) {
  const tocades = []
  const cap = () => ({
    async run() {
      return { meta: { changes: 1 } }
    },
    async all() {
      return { results: [] }
    },
    async first() {
      return null
    },
  })
  return {
    ASSISTANT_MODE: mode,
    ASSISTANT_SCOPE: abast,
    ...(sostre === undefined ? {} : { ASSISTANT_MAX_PER_PASS: String(sostre) }),
    tocades,
    AI: {
      run: vi.fn(async () => ({ response: 'VEREDICTE: publicar · MOTIU: troballa clara' })),
    },
    EDITORIAL_DB: {
      prepare(sql) {
        return {
          ...cap(),
          bind: (...args) => {
            if (/UPDATE/i.test(sql)) tocades.push(args[args.length - 1])
            return cap()
          },
        }
      },
      async batch(statements) {
        return statements.map(() => ({ meta: { changes: 1 } }))
      },
    },
    _candidates: candidates,
  }
}

describe('resolució del sostre', () => {
  it('un valor absent cau al defecte', () => {
    expect(resolSostre({})).toBe(MAX_PER_PASSADA_DEFECTE)
  })

  it('un valor absurd cau al defecte, no a zero ni a infinit', () => {
    expect(resolSostre({ ASSISTANT_MAX_PER_PASS: 'moltes' })).toBe(MAX_PER_PASSADA_DEFECTE)
    expect(resolSostre({ ASSISTANT_MAX_PER_PASS: '0' })).toBe(MAX_PER_PASSADA_DEFECTE)
    expect(resolSostre({ ASSISTANT_MAX_PER_PASS: '-3' })).toBe(MAX_PER_PASSADA_DEFECTE)
  })

  it('un valor bo es respecta', () => {
    expect(resolSostre({ ASSISTANT_MAX_PER_PASS: '2' })).toBe(2)
  })
})

describe('resolució de l’abast: falla tancat', () => {
  it('sense res declarat, es conserva la reserva d’àmbits', () => {
    expect(resolAbast({})).toBe('guarded')
  })

  it('només el valor exacte «all» obre l’automatisme', () => {
    expect(resolAbast({ ASSISTANT_SCOPE: 'all' })).toBe('all')
    expect(resolAbast({ ASSISTANT_SCOPE: 'all ' })).toBe('guarded')
    expect(resolAbast({ ASSISTANT_SCOPE: 'tot' })).toBe('guarded')
    expect(resolAbast({ ASSISTANT_SCOPE: true })).toBe('guarded')
  })
})

describe('el sostre ajorna, no descarta', () => {
  it('amb 10 candidates i sostre 3, només se’n publiquen 3', async () => {
    const candidates = Array.from({ length: 10 }, (_, i) => candidata(i))
    const env = entorn(candidates, { sostre: 3 })
    const { aprovades } = await passadaDeLAjudant(env, candidates)
    expect(aprovades).toHaveLength(3)
  })

  it('les que sobren no reben cap decisió: es tornaran a mirar', async () => {
    const candidates = Array.from({ length: 10 }, (_, i) => candidata(i))
    const env = entorn(candidates, { sostre: 3 })
    await passadaDeLAjudant(env, candidates)
    // Cap UPDATE ha de tocar les set ajornades. Si el sostre les descartés,
    // aquí hi hauria deu files tocades en lloc de tres.
    expect(new Set(env.tocades).size).toBe(3)
  })

  it('sense passar-se del sostre, es publiquen totes', async () => {
    const candidates = Array.from({ length: 2 }, (_, i) => candidata(i))
    const env = entorn(candidates, { sostre: 6 })
    const { aprovades } = await passadaDeLAjudant(env, candidates)
    expect(aprovades).toHaveLength(2)
  })

  it('deixa constància del que ha ajornat: mai un límit en silenci', async () => {
    const registre = vi.spyOn(console, 'log').mockImplementation(() => {})
    const candidates = Array.from({ length: 8 }, (_, i) => candidata(i))
    await passadaDeLAjudant(entorn(candidates, { sostre: 2 }), candidates)
    const linies = registre.mock.calls.map(([l]) => String(l))
    const cap = linies.find((l) => l.includes('assistant.capped'))
    expect(cap).toBeTruthy()
    expect(JSON.parse(cap).ajornades).toBe(6)
    registre.mockRestore()
  })
})
