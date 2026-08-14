import { describe, expect, it, vi } from 'vitest'
import {
  countWords,
  editorialQualityProfile,
  evaluateEditorialQuality,
  isPublishableStory,
  selectPublishableStories,
} from '../editorialQuality.js'
import {
  applyOwnContent,
  parseOwnContentBatch,
  shortenTitle,
} from '../storyText.js'

function qualityStory(overrides = {}) {
  return {
    title: 'Una cooperativa recupera el mercat municipal amb nous llocs de treball',
    editorialFormat: 'constructive',
    source: 'Mitjà local',
    url: 'https://exemple.cat/cooperativa',
    ownContent: true,
    body: [
      'La cooperativa del barri ha reobert aquest dilluns el mercat municipal després de sis mesos de treballs. El projecte incorpora dotze parades gestionades per productors de la comarca i reserva dos espais per a iniciatives noves.',
      'L’acord amb l’ajuntament inclou formació comercial i un lloguer progressiu durant els primers dos anys. La mesura ha permès contractar divuit persones i recuperar un edifici que estava tancat des del 2024.',
      'Els responsables publicaran cada trimestre les dades d’ocupació i d’activitat per comprovar si el model és sostenible.',
    ],
    impact:
      'El projecte combina ocupació, comerç de proximitat i recuperació d’un equipament públic.',
    ...overrides,
  }
}

describe('barrera de qualitat editorial', () => {
  it('compta paraules ignorant espais i HTML', () => {
    expect(countWords('<p>Una peça amb cinc paraules.</p>')).toBe(5)
  })

  it('aplica llindars diferents segons el format', () => {
    expect(editorialQualityProfile('constructive').minBodyWords).toBe(45)
    expect(editorialQualityProfile('data').minBodyWords).toBe(25)
  })

  // Regressió del 27-07-2026: amb el llindar a 70 paraules i 4 frases, la
  // portada va passar de 35 peces a 3 en dos dies. El redactor automàtic
  // entrega cossos com aquest —complets, amb fets concrets, però de 55
  // paraules en 4 frases— i tots suspenien. El llindar ha d'anar calibrat amb
  // el que el model escriu de debò, no amb el que li demanem.
  it('admet el cos real que escriu el redactor automàtic (55 paraules)', () => {
    const result = evaluateEditorialQuality(
      qualityStory({
        title: 'Mataró connecta el centre i la platja amb un nou carril bici',
        body: [
          'L’Ajuntament de Mataró ha inaugurat un carril bici de 1,2 quilòmetres que uneix la plaça de Santa Anna amb el passeig marítim. La nova infraestructura ha costat 480.000 euros, finançada amb fons europeus. El carril és bidireccional i està separat del trànsit rodat per una vorada. El consistori preveu ampliar-lo fins al Parc Central l’any vinent.',
        ],
        impact: 'Millora la mobilitat sostenible i segura a la ciutat.',
      }),
    )
    expect(result.metrics.bodyWords).toBeLessThan(70)
    expect(result.issues).toEqual([])
    expect(result.passes).toBe(true)
  })

  it('admet una peça amb context, fets i utilitat', () => {
    const result = evaluateEditorialQuality(qualityStory())
    expect(result.passes).toBe(true)
    expect(result.metrics.bodyWords).toBeGreaterThanOrEqual(70)
    expect(isPublishableStory(qualityStory())).toBe(true)
  })

  it('rebutja la peça de deu paraules que abans es publicava', () => {
    const story = qualityStory({
      title: 'Exposició de còmics de Cristian Robles',
      body: ['S’ha inaugurat una exposició permanent de còmics de Cristian Robles.'],
      impact: 'Permet conèixer l’obra de Cristian Robles.',
    })
    const result = evaluateEditorialQuality(story)
    expect(result.passes).toBe(false)
    expect(result.issues).toContain('body-too-short')
    expect(result.issues).toContain('generic-impact')
  })

  it('rebutja la plantilla repetitiva de verificació', () => {
    const result = evaluateEditorialQuality(
      qualityStory({
        title: 'Aquest mapa ferroviari viral conté línies i ciutats inventades',
        editorialFormat: 'verification',
        body: [
          'Verificat ha publicat una comprovació documentada sobre aquesta afirmació. Aporta una comprovació documentada per separar els fets del soroll. Consulta la font original per veure’n totes les dades i el context.',
        ],
        impact:
          'Aporta una comprovació documentada per separar els fets del soroll.',
      }),
    )
    expect(result.passes).toBe(false)
    expect(result.issues).toContain('generic-body')
  })

  it('filtra i informa dels rebutjos sense modificar les peces bones', () => {
    const good = qualityStory()
    const bad = qualityStory({ body: ['Text massa curt.'] })
    const rejected = []
    expect(
      selectPublishableStories([good, bad], {
        onReject: (story, result) => rejected.push({ story, result }),
      }),
    ).toEqual([good])
    expect(rejected).toHaveLength(1)
    expect(rejected[0].result.issues).toContain('body-too-short')
  })
})

describe('titular llarg — s’escurça, no tomba la peça', () => {
  // El 27/07/2026, 3 dels 8 rebutjos d'una passada eren peces amb el cos ben
  // escrit (60 i 53 paraules) tombades NOMÉS perquè el titular passava de 20
  // paraules. Els titulars oficials de convocatòries i estudis hi passen sovint.
  it('publica una peça amb el cos bo encara que el titular original sigui llarg', () => {
    const cos =
      'La Generalitat obre una línia d’ajuts per a entitats culturals del món rural amb un pressupost de 900.000 euros. Les sol·licituds es poden presentar per via telemàtica fins al 28 de juliol. Poden optar-hi associacions, fundacions i ajuntaments de municipis de menys de cinc mil habitants. La resolució es preveu per a l’octubre.'
    const titolLlarg =
      'Convocatòria de subvencions per a projectes i activitats culturals que es desenvolupin en el medi rural de Catalunya durant el 2026'
    expect(titolLlarg.split(/\s+/).length).toBeGreaterThan(20)

    const escurcat = shortenTitle(titolLlarg)
    expect(escurcat.split(/\s+/).length).toBeLessThanOrEqual(20)
    expect(
      evaluateEditorialQuality({
        title: escurcat,
        body: [cos],
        impact: 'Obre finançament públic a entitats culturals de pobles petits.',
        source: 'RAISC',
        url: 'https://exemple.cat/ajuts',
        editorialFormat: 'opportunity',
      }).passes,
    ).toBe(true)
  })

  it('no deixa el titular penjat en una preposició', () => {
    for (const titol of [
      'Convocatòria de subvencions per a projectes i activitats culturals que es desenvolupin en el medi rural de Catalunya durant el 2026',
      'Resolución por la que se convocan las subvenciones destinadas a entidades sin ánimo de lucro para el fomento de la lectura en',
    ]) {
      const escurcat = shortenTitle(titol)
      expect(escurcat.split(/\s+/).length).toBeLessThanOrEqual(20)
      expect(escurcat.split(/\s+/).length).toBeGreaterThanOrEqual(5)
      expect(escurcat, titol).not.toMatch(
        /\s(?:i|o|de|del|en|amb|per|durant|fins|a|al|the|of|for|y|para|por|sin)$/i,
      )
    }
  })

  it('no toca els titulars que ja caben', () => {
    const bo = 'Mataró inaugura un carril bici que connecta el centre amb la platja'
    expect(shortenTitle(bo)).toBe(bo)
  })

  // Xarxa de seguretat: un "titular" desmesurat no és un titular, és un error
  // de lectura de la resposta del model (com el que hi va haver fins al 27/07).
  it('segueix suspenent un titular desmesurat', () => {
    const trencat = Array.from({ length: 60 }, (_, i) => `paraula${i}`).join(' ')
    expect(
      evaluateEditorialQuality(qualityStory({ title: trencat })).issues,
    ).toContain('title-length')
  })

  // Un cos de 46 paraules en dues frases superava el mínim de paraules i queia
  // igualment. La profunditat la mesuren les paraules.
  it('admet un cos prou llarg escrit en dues frases', () => {
    const dosFrases =
      'L’Ajuntament de Lliçà de Vall ha obert el nou centre de reciclatge de residus industrials després de dos anys d’obres i una inversió de sis-cents mil euros. La instal·lació donarà servei a una trentena d’empreses del polígon i podrà tractar fins a quatre mil tones l’any.'
    const result = evaluateEditorialQuality(
      qualityStory({
        title: 'Lliçà de Vall obre un centre de reciclatge industrial',
        body: [dosFrases],
        impact: 'Estalvia desplaçaments de residus a una trentena d’empreses.',
      }),
    )
    expect(result.metrics.sentences).toBe(2)
    expect(result.issues).toEqual([])
  })
})

describe('lectura de la resposta del model', () => {
  // Regressió del 27-07-2026. Amb lots de cinc peces (els de producció) el
  // model numera només el titular i indenta la resta. El lector antic exigia
  // el número a cada línia, no trobava mai el cos i TOTES les peces sortien
  // sense text: és el que va deixar el diari en tres peces.
  it('llegeix el format indentat que el model fa servir als lots grans', () => {
    const [first, second] = parseOwnContentBatch(
      [
        '1. titular: Mataró inaugura un carril bici entre el centre i la platja',
        "   cos: L'Ajuntament de Mataró ha estrenat un carril bici de 1,2 quilòmetres.",
        '   impacte: Millora la mobilitat sostenible a la ciutat.',
        '   imatge: a bike path on a sunny city street',
        '',
        '2. titular: Una ciutat francesa planta mil arbres per lluitar contra la calor',
        '   cos: La ciutat de Nantes ha plantat mil arbres en sis barris aquest hivern.',
        '   impacte: Redueix les illes de calor als carrers afectats.',
        '   imatge: a tree planting on a city street',
      ].join('\n'),
      2,
    )

    expect(first.title).toBe(
      'Mataró inaugura un carril bici entre el centre i la platja',
    )
    expect(first.body).toContain('1,2 quilòmetres')
    expect(first.impact).toBe('Millora la mobilitat sostenible a la ciutat.')
    expect(first.brief).toBe('a bike path on a sunny city street')
    expect(second.title).toContain('mil arbres')
    expect(second.body).toContain('Nantes')
  })

  it('segueix llegint el format amb número a cada línia', () => {
    const [only] = parseOwnContentBatch(
      [
        '1 titular: Una cooperativa recupera el mercat municipal',
        '1 cos: La cooperativa ha reobert el mercat aquest dilluns.',
        '1 impacte: Recupera un equipament públic per al barri.',
        '1 imatge: a reopened neighborhood market',
      ].join('\n'),
      1,
    )
    expect(only.title).toBe('Una cooperativa recupera el mercat municipal')
    expect(only.body).toContain('reobert el mercat')
    expect(only.impact).toContain('equipament públic')
  })

  it('ajunta un cos repartit en diverses línies', () => {
    const [only] = parseOwnContentBatch(
      [
        '1. titular: Una biblioteca comunitària reobre a Leeds',
        '   cos: La biblioteca victoriana ha reobert dissabte',
        '   després de dos anys de restauració finançada amb una subvenció.',
        '   impacte: Torna a oferir un espai d’estudi al barri.',
      ].join('\n'),
      1,
    )
    expect(only.body).toContain('dos anys de restauració')
    expect(only.impact).toBe('Torna a oferir un espai d’estudi al barri.')
  })
})

describe('reescriptura editorial amb context factual', () => {
  const sourceStory = {
    title: 'La cooperativa reobre el mercat del barri',
    summary: 'La iniciativa recupera un edifici municipal.',
    sourceContext:
      'La cooperativa Nou Mercat ha reobert l’edifici municipal aquest dilluns després de sis mesos de reforma. Hi treballen divuit persones, hi ha dotze parades de productors locals i dues places reservades per a projectes nous. L’acord municipal preveu formació i lloguers progressius durant dos anys.',
    category: 'Economia',
    editorialFormat: 'constructive',
    language: 'ca',
    source: 'Mitjà local',
    sourceTier: 'B',
    url: 'https://exemple.cat/nou-mercat',
    publishedAt: '2026-07-27T08:00:00Z',
  }

  const validBody =
    'La cooperativa Nou Mercat ha reobert aquest dilluns l’edifici municipal després de sis mesos de reforma. El projecte posa en marxa dotze parades gestionades per productors locals i reserva dos espais per a iniciatives que comencen. En aquesta primera etapa hi treballen divuit persones vinculades al comerç i a la gestió de l’equipament. L’acord amb l’ajuntament incorpora formació específica i un sistema de lloguers progressius durant els dos primers anys. Els responsables hauran de comprovar ara si l’activitat comercial permet consolidar els llocs de treball i mantenir l’edifici obert.'

  it('utilitza el context ampliat, desa la versió vigent del cau i no el publica', async () => {
    const run = vi.fn().mockResolvedValue({
      response: [
        '1 titular: Una cooperativa recupera el mercat municipal i crea activitat local',
        `1 cos: ${validBody}`,
        '1 impacte: El projecte recupera un equipament públic i obre oportunitats per al comerç local.',
        '1 imatge: reopened neighborhood market with local produce stalls',
      ].join('\n'),
    })
    const get = vi.fn().mockResolvedValue(null)
    const put = vi.fn().mockResolvedValue(undefined)

    const [story] = await applyOwnContent([sourceStory], {
      AI: { run },
      LIVE_NEWS_KV: { get, put },
    })

    expect(story.ownContent).toBe(true)
    expect(story.sourceContext).toBeUndefined()
    expect(story.body.join(' ')).toContain('divuit persones')
    expect(run.mock.calls[0][1].messages[1].content).toContain('dotze parades')
    // La versió puja cada cop que canvia el que se li demana al redactor; el
    // que ha de ser cert sempre és que la clau en porti una i que no sigui
    // cap de les que ja s'han invalidat.
    expect(put.mock.calls[0][0]).toMatch(/^own:v\d+:/)
    expect(put.mock.calls[0][0]).not.toMatch(/^own:v[12]:/)
  })

  // Una resposta curta es CONSERVA i es jutja una sola vegada, a la porta de
  // publicació. Abans es llençava aquí (deixant la peça sense cap text) i tot
  // seguit es tornava a suspendre per estar buida: el mateix defecte castigat
  // dues vegades, que és el que va buidar el diari el 26-07-2026.
  it('conserva una resposta curta i deixa que decideixi la porta de publicació', async () => {
    const run = vi.fn().mockResolvedValue({
      response: [
        '1 titular: Una cooperativa recupera el mercat municipal del barri',
        '1 cos: La cooperativa ha reobert el mercat i hi treballen divuit persones.',
        '1 impacte: El projecte recupera un equipament públic per al comerç de proximitat.',
        '1 imatge: reopened neighborhood market',
      ].join('\n'),
    })

    const [story] = await applyOwnContent([sourceStory], {
      AI: { run },
      LIVE_NEWS_KV: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
      },
    })

    expect(story.ownContent).toBe(true)
    expect(story.body.join(' ')).toContain('divuit persones')
    // Massa curta per publicar-se, però la decisió la pren un sol filtre.
    expect(isPublishableStory(story)).toBe(false)
    expect(evaluateEditorialQuality(story).issues).toContain('body-too-short')
  })

  it('descarta el text de plantilla en generar-lo, no per la llargada', async () => {
    const run = vi.fn().mockResolvedValue({
      response: [
        '1 titular: Una cooperativa recupera el mercat municipal del barri',
        '1 cos: INFORMACIO_INSUFICIENT',
        '1 impacte: Permet conèixer la reobertura del mercat.',
        '1 imatge: reopened neighborhood market',
      ].join('\n'),
    })

    const [story] = await applyOwnContent([sourceStory], {
      AI: { run },
      LIVE_NEWS_KV: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
      },
    })

    expect(story.ownContent).toBe(false)
    expect(story.body).toEqual([])
  })
})
