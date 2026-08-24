import { describe, expect, it } from 'vitest'
import { reescriuCandidata } from '../rewriteCandidate.js'
import { handleReviewRoutes } from '../reviewPage.js'
import { updateCandidateText } from '../reviewGate.js'

// LA TERCERA SORTIDA DE LA SALA.
//
// Sergi va posar la regla clara: una peça no es pot descartar perquè estigui
// mal escrita en català, perquè el defecte és de la nostra fàbrica i no de la
// notícia. Fins ara, però, la sala només tenia "Aprova" i "Descarta". Aquestes
// proves fixen què ha de fer el botó nou i, sobretot, QUÈ NO POT FER MAI:
//
//   · no pot afegir cap dada que no fos al text original;
//   · no pot publicar res, ni canviar l'estat de la peça;
//   · no pot tocar una peça que algú ja hagi decidit.

const peca = {
  id: 'feed-x',
  url: 'https://example.org/x',
  title: 'Físics teorics predissen partícules de càrrega molt petita',
  body: [
    'Els físics han teoritzat durant molt de temps sobre partícules amb càrregues elèctriques molt petites. Segons Phys.org, ara hi ha una manera de detectar-les.',
  ],
  impact: 'Pot ajudar a entendre la física de partícules.',
}

function ai(resposta) {
  return {
    AI: { run: async () => ({ response: resposta }) },
  }
}

describe('reescriure una peça mal escrita', () => {
  it('en torna una de ben escrita, amb el mateix contingut', async () => {
    const out = await reescriuCandidata(
      ai(
        [
          'titular: Uns físics teòrics prediuen partícules de càrrega molt petita',
          'cos: Els físics fa temps que teoritzen sobre partícules amb càrregues elèctriques molt petites. Segons Phys.org, ara hi ha una manera de detectar-les.',
          'impacte: Pot ajudar a entendre la física de partícules.',
        ].join('\n'),
      ),
      peca,
    )
    expect(out.ok).toBe(true)
    expect(out.story.title).toContain('prediuen')
    expect(out.story.title).not.toContain('predissen')
    // La resta de la peça no es toca: mateixa adreça, mateixa font.
    expect(out.story.url).toBe(peca.url)
    expect(out.story.rewrittenAt).toBeTruthy()
  })

  it('NO accepta una reescriptura que s’inventa una xifra', async () => {
    const out = await reescriuCandidata(
      ai(
        [
          'titular: Uns físics prediuen 47 partícules noves de càrrega molt petita',
          'cos: Els físics fa temps que teoritzen sobre aquestes partícules.',
          'impacte: Important.',
        ].join('\n'),
      ),
      peca,
    )
    expect(out.ok).toBe(false)
    expect(out.motiu).toContain('47')
  })

  it('NO accepta una reescriptura que s’inventa un nom propi', async () => {
    const out = await reescriuCandidata(
      ai(
        [
          'titular: El CERN i la Universitat de Tòquio prediuen partícules de càrrega petita',
          'cos: Els físics fa temps que teoritzen sobre aquestes partícules.',
          'impacte: Important.',
        ].join('\n'),
      ),
      peca,
    )
    expect(out.ok).toBe(false)
  })

  it('si la resposta no s’entén, no toca res', async () => {
    const out = await reescriuCandidata(ai('no sé de què em parles'), peca)
    expect(out.ok).toBe(false)
    expect(out.motiu).toBeTruthy()
  })

  it('si la màquina no respon, tampoc', async () => {
    const out = await reescriuCandidata(
      {
        AI: {
          run: async () => {
            throw new Error('IA caiguda')
          },
        },
      },
      peca,
    )
    expect(out.ok).toBe(false)
  })
})

describe('desar el text reescrit no pot publicar res', () => {
  function d1(canvis = 1) {
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
          async run() {
            escriptures.push({ query, values: this.values })
            return { meta: { changes: canvis } }
          },
        }
      },
    }
  }

  it('només toca el text, i només si la peça encara espera', async () => {
    const base = d1()
    const out = await updateCandidateText({ EDITORIAL_DB: base }, 'feed-x', {
      ...peca,
      title: 'Un titular ben escrit',
    })
    expect(out.ok).toBe(true)
    const q = base.escriptures[0].query
    // No hi ha cap rastre de decisió ni de publicació.
    expect(q).not.toContain('human_decision = ')
    expect(q).not.toContain('editorial_status = ?')
    expect(q).not.toContain('live_state')
    // I la condició protegeix les que ja s'han decidit.
    expect(q).toContain('human_decision IS NULL')
    expect(q).toContain('auto_decision IS NULL')
  })

  it('si algú l’ha decidit mentrestant, no la sobreescriu', async () => {
    const out = await updateCandidateText({ EDITORIAL_DB: d1(0) }, 'feed-x', {
      ...peca,
      title: 'Un titular ben escrit',
    })
    expect(out.ok).toBe(false)
    expect(out.error).toBe('not-pending')
  })

  it('no desa material intern al text de la peça', async () => {
    const base = d1()
    await updateCandidateText({ EDITORIAL_DB: base }, 'feed-x', {
      ...peca,
      reviewSourceContext: 'THE ENGLISH SOURCE',
      title: 'Un titular ben escrit',
    })
    expect(JSON.stringify(base.escriptures)).not.toContain('THE ENGLISH SOURCE')
  })
})

describe('la sala coneix totes les seves adreces', () => {
  // El botó es va desplegar sense funcionar: `handleReviewRoutes` tenia una
  // llista de rutes que no incloïa la nova, i el POST queia al servidor de
  // fitxers amb un 405. Aquesta prova és perquè no torni a passar.
  it('cap ruta de /revisio cau fora de la sala', async () => {
    const env = { BONDIARI_REVIEW_PASSWORD: 'secret' }
    for (const ruta of ['/revisio', '/revisio/decidir', '/revisio/reescriure']) {
      const res = await handleReviewRoutes(
        new Request(`https://bondiari.com${ruta}`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: 'id=x',
        }),
        env,
      )
      expect(res, `${ruta} ha caigut fora de la sala`).not.toBeNull()
    }
  })

  it('un POST amb brossa no tomba la sala', async () => {
    // Un robot qualsevol pot enviar qualsevol cosa a una pàgina pública.
    // Abans, un cos sense formulari feia petar la pàgina amb un error 500.
    const res = await handleReviewRoutes(
      new Request('https://bondiari.com/revisio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"a":1}',
      }),
      { BONDIARI_REVIEW_PASSWORD: 'secret' },
    )
    expect(res.status).toBe(401)
  })

  it("i una ruta que no és seva, sí que hi cau", async () => {
    const res = await handleReviewRoutes(
      new Request('https://bondiari.com/noticia/x'),
      { BONDIARI_REVIEW_PASSWORD: 'secret' },
    )
    expect(res).toBeNull()
  })
})
