import { describe, expect, it, vi } from 'vitest'
import { passadaDeLAjudant } from '../assistantPass.js'
import { readEditionForDistribution } from '../editorialStore.js'
import { handlePipelineBatch } from '../pipelineQueue.js'
import { listPendingWithdrawals, shadowAgreement } from '../reviewGate.js'
import { resetTextModelFallback } from '../ai/textModel.js'

// EL MODE DE PROVES HA DE DIR LA VERITAT, O NO SERVEIX DE RES.
//
// Quatre maneres que tenia de mentir, totes reproduïdes per Codex:
//
//   1. Etiquetar els veredictes amb el model equivocat quan Gemini falla a mig
//      lot i respon el recanvi.
//   2. Ensenyar "100 de cada 100" amagant que de 100 peces només en va decidir
//      5 i en va dubtar 95.
//   3. Repartir una altra edició quan la d'avui es queda a zero peces perquè
//      se n'han retirat.
//   4. Dir "retirada pendent" només un instant, i oblidar-ho en recarregar.

describe('cada veredicte diu QUI l’ha emès', () => {
  it('si Gemini falla a mig lot, la segona peça consta com a Cloudflare', async () => {
    resetTextModelFallback()
    let crides = 0
    globalThis.fetch = vi.fn(async () => {
      crides += 1
      // La primera peça la respon Gemini; la segona, no.
      if (crides === 1) {
        return new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: 'VEREDICTE: publicar · MOTIU: bona' }] } },
            ],
          }),
          { status: 200 },
        )
      }
      return new Response('error intern', { status: 500 })
    })

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
          async all() {
            return { results: [] }
          },
          async run() {
            return { meta: { changes: 1 } }
          },
        }
      },
      async batch(statements) {
        for (const s of statements) escriptures.push({ query: s.query, values: s.values })
        return statements.map(() => ({ meta: { changes: 1 } }))
      },
    }

    const peca = (id) => ({
      id,
      url: `https://example.org/${id}`,
      title: 'Un observatori nou permet reconstruir el cel de fa mil·lennis',
      topic: 'Astronomia',
      body: ['Un text.'],
      reviewSourceContext: 'A new observatory lets astronomers reconstruct ancient skies.',
    })

    await passadaDeLAjudant(
      {
        EDITORIAL_DB: db,
        GEMINI_API_KEY: 'clau-de-prova',
        GEMINI_MODEL: 'gemini-flash-latest',
        AI: { run: async () => ({ response: 'VEREDICTE: publicar · MOTIU: bona' }) },
        ASSISTANT_MODE: 'shadow',
      },
      [peca('primera'), peca('segona')],
    )

    const ombra = escriptures.filter((e) => e.query.includes('shadow_decision'))
    expect(ombra).toHaveLength(2)
    const versions = ombra.map((e) => e.values[3])
    expect(versions[0]).toContain('gemini:')
    expect(versions[1]).toContain('cloudflare:')
    // I no totes dues iguals, que és el que passava preguntant-ho al final.
    expect(versions[0]).not.toBe(versions[1])
    globalThis.fetch = undefined
    resetTextModelFallback()
  })
})

describe('la concordança no amaga els dubtes', () => {
  function d1Amb(files) {
    return {
      prepare() {
        return {
          bind() {
            return this
          },
          async all() {
            return { results: files }
          },
        }
      },
    }
  }

  it('compta les peces que va deixar per a una persona', async () => {
    const files = [
      ...Array.from({ length: 5 }, () => ({
        shadow_decision: 'approve',
        human_decision: 'approve',
        shadow_version: 'v1·gemini:x',
      })),
      ...Array.from({ length: 95 }, () => ({
        shadow_decision: 'doubt',
        human_decision: 'approve',
        shadow_version: 'v1·gemini:x',
      })),
    ]
    const out = await shadowAgreement({ EDITORIAL_DB: d1Amb(files) })
    const actual = out.versions[0]
    expect(actual.contrastables).toBe(100)
    expect(actual.decidides).toBe(5)
    expect(actual.dubtes).toBe(95)
    expect(actual.concorden).toBe(5)
  })

  it('no barreja versions ni models diferents', async () => {
    const out = await shadowAgreement({
      EDITORIAL_DB: d1Amb([
        { shadow_decision: 'approve', human_decision: 'approve', shadow_version: 'v2·gemini:x' },
        { shadow_decision: 'approve', human_decision: 'reject', shadow_version: 'v1·llama:y' },
      ]),
    })
    expect(out.versions).toHaveLength(2)
    // La primera és la més recent, que és la que fa servir ara.
    expect(out.versions[0].versio).toBe('v2·gemini:x')
    expect(out.versions[0].concorden).toBe(1)
    expect(out.versions[1].concorden).toBe(0)
  })
})

describe('una edició buida no reparteix una altra edició', () => {
  function entorn({ edicioExisteix, peces }) {
    const desats = []
    const db = {
      prepare(query) {
        return {
          values: [],
          bind(...values) {
            this.values = values
            return this
          },
          async first() {
            if (query.includes('FROM editions')) {
              return edicioExisteix ? { id: 'edicio-1' } : null
            }
            return null
          },
          async all() {
            return { results: peces.map((p) => ({ payload_json: JSON.stringify(p) })) }
          },
          async run() {
            desats.push({ query, values: this.values })
            return { meta: { changes: 1 } }
          },
        }
      },
      async batch(statements) {
        return statements.map(() => ({ meta: { changes: 1 } }))
      },
    }
    return {
      desats,
      env: {
        EDITORIAL_DB: db,
        LIVE_NEWS_KV: {
          async get() {
            return { stories: [{ id: 'vella', title: 'Una peça d’una altra edició' }] }
          },
        },
      },
    }
  }

  it('si l’edició existeix però ha quedat a zero, no s’envia res', async () => {
    const { stories, edicioTrobada } = await readEditionForDistribution(
      entorn({ edicioExisteix: true, peces: [] }).env,
      'edicio-1',
    )
    expect(edicioTrobada).toBe(true)
    expect(stories).toHaveLength(0)
  })

  it('si no hi ha edició, es diu que no s’ha trobat', async () => {
    const out = await readEditionForDistribution(
      entorn({ edicioExisteix: false, peces: [] }).env,
      'edicio-inexistent',
    )
    expect(out.edicioTrobada).toBe(false)
  })

  it('el repartiment del dia no envia res amb una edició buida', async () => {
    const { env, desats } = entorn({ edicioExisteix: true, peces: [] })
    let correusEnviats = 0
    env.RESEND_API_KEY = 'x'
    globalThis.fetch = vi.fn(async () => {
      correusEnviats += 1
      return new Response('{}', { status: 200 })
    })
    await handlePipelineBatch(
      {
        messages: [
          {
            body: {
              version: 1,
              type: 'daily-distribution',
              idempotencyKey: 'distribution:daily:edicio-1',
              editionId: 'edicio-1',
            },
            ack: () => {},
            retry: () => {},
          },
        ],
      },
      env,
    )
    // Ni un sol enviament, i la feina consta acabada com a "sense peces": no
    // s'ha caigut a `latest` ni s'ha deixat el missatge sense confirmar.
    expect(correusEnviats).toBe(0)
    expect(JSON.stringify(desats)).toContain('no-stories')
    globalThis.fetch = undefined
  })
})

describe('«retirada pendent» no s’oblida en recarregar', () => {
  it('la sala pot llistar les que encara són al web', async () => {
    const db = {
      prepare(query) {
        return {
          async all() {
            if (!query.includes("withdrawal = 'pending'")) return { results: [] }
            return { results: [{ id: 'peca-1', title: 'Una peça descartada' }] }
          },
        }
      },
    }
    const out = await listPendingWithdrawals({ EDITORIAL_DB: db })
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Una peça descartada')
  })
})
