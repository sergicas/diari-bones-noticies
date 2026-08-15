import { describe, expect, it, vi } from 'vitest'
import {
  dadesSenseSuport,
  esSensible,
  potDecidirSol,
  revisaCandidata,
} from '../editorAssistant.js'

// L'AJUDANT PUBLICA SOL, i per això les guàrdies manen sobre el seu criteri.
//
// Sergi va triar la màxima autonomia sabent el que compra. La condició és que
// hi hagi coses que la màquina no decideix mai, i que això no depengui de si el
// model d'aquell dia està encertat.

function ai(resposta) {
  return { run: vi.fn(async () => ({ response: resposta })) }
}

describe('guàrdia de fets: xifres i noms propis', () => {
  it('atura una xifra que no és a la font', () => {
    expect(
      dadesSenseSuport({
        title: 'La missió arriba a 900 quilòmetres del cometa',
        reviewSourceContext: 'The mission approached within 300 kilometres of the comet.',
      }),
    ).toContain('900')
  })

  it('deixa passar una xifra que sí que hi és', () => {
    expect(
      dadesSenseSuport({
        title: 'La missió arriba a 300 quilòmetres del cometa',
        reviewSourceContext: 'The mission approached within 300 kilometres of the comet.',
      }),
    ).toHaveLength(0)
  })

  it('atura un nom propi inventat', () => {
    expect(
      dadesSenseSuport({
        title: 'La NASA i Nintendo llancen un observatori conjunt',
        reviewSourceContext: 'NASA announced a new observatory built with European partners.',
      }),
    ).toContain('Nintendo')
  })

  it('NO marca paraules corrents pel fet que la font sigui en anglès', () => {
    // El primer intent comparava mot a mot un titular català amb una font
    // anglesa i marcava "permet" i "mil·lennis" com a inventats. Inservible.
    expect(
      dadesSenseSuport({
        title: 'Un observatori a Nou Mèxic permet veure el cel de fa mil·lennis',
        reviewSourceContext:
          'A new observatory in New Mexico lets astronomers reconstruct ancient skies.',
      }),
    ).toHaveLength(0)
  })

  it('sense font amb què comparar, no s’inventa cap sospita', () => {
    expect(dadesSenseSuport({ title: 'Un titular qualsevol amb 42 coses' })).toHaveLength(0)
  })
})

describe('guàrdia d’àmbits sensibles', () => {
  it('reconeix salut i medicina', () => {
    for (const title of [
      "L'FDA aprova un tractament per a la leucèmia de cèl·lules plasmàtiques",
      'Un assaig clínic mostra millores en pacients amb depressió',
      'Una vacuna nova redueix la mortalitat infantil',
    ]) {
      expect(esSensible({ title, body: [] }), title).toBe(true)
    }
  })

  it('no confon una peça d’astronomia amb una de salut', () => {
    // Amb àmbit: sense àmbit automatitzable, la llista positiva ja la treu de
    // l'automatisme abans de mirar cap matèria delicada.
    expect(
      esSensible({
        topic: 'Astronomia',
        title: 'Webb detecta aigua prop del centre galàctic',
        body: [],
      }),
    ).toBe(false)
  })
})

describe('el veredicte', () => {
  const env = (resposta) => ({ AI: ai(resposta) })

  it('EL CAS DE L’FDA no s’aprova mai sol', async () => {
    // La peça real del 14-08-2026: deia "leucèmia de cèl·lules plasmàtiques"
    // quan la font parlava de mieloma múltiple. Encara que l'IA digués que sí,
    // la guàrdia de salut la treu de l'automatisme.
    const r = await revisaCandidata(
      env('VEREDICTE: publicar · MOTIU: sembla una bona notícia'),
      {
        title: "L'FDA aprova un tractament per a la leucèmia de cèl·lules plasmàtiques",
        reviewSourceContext: 'FDA approves drug for relapsed or refractory multiple myeloma.',
        topic: 'Ciència',
        body: ['Un text.'],
      },
    )
    expect(r.veredicte).toBe('dubte')
    expect(r.guardia).toBe('sensible')
  })

  it('una xifra inventada tampoc, digui el que digui l’IA', async () => {
    const r = await revisaCandidata(env('VEREDICTE: publicar · MOTIU: molt bona'), {
      title: 'El telescopi observa 900 galàxies noves en una nit',
      reviewSourceContext: 'The telescope observed 300 new galaxies in a single night.',
      topic: 'Astronomia',
      body: ['Un text.'],
    })
    expect(r.veredicte).toBe('dubte')
    expect(r.guardia).toBe('fets')
  })

  it('una peça neta i bona, l’aprova', async () => {
    const r = await revisaCandidata(
      env('VEREDICTE: publicar · MOTIU: explica una troballa concreta'),
      {
        title: 'Un observatori permet reconstruir el cel de fa mil·lennis',
        reviewSourceContext: 'A new observatory lets astronomers reconstruct ancient skies.',
        topic: 'Astronomia',
        body: ['Un text.'],
      },
    )
    expect(r.veredicte).toBe('publicar')
  })

  it('una notícia de procés, la descarta', async () => {
    const r = await revisaCandidata(
      env('VEREDICTE: descartar · MOTIU: només explica intencions'),
      {
        title: 'Les empreses busquen dades per als seus agents',
        reviewSourceContext: 'Companies are looking for reliable data.',
        topic: 'IA',
        body: ['Un text.'],
      },
    )
    expect(r.veredicte).toBe('descartar')
  })

  it('si l’IA falla, no decideix: ho deixa per a una persona', async () => {
    const r = await revisaCandidata(
      { AI: { run: async () => { throw new Error('IA caiguda') } } },
      { title: 'Un titular qualsevol prou llarg', reviewSourceContext: 'Some source.', body: [], topic: 'Ciència' },
    )
    expect(r.veredicte).toBe('dubte')
  })

  it('si la resposta no s’entén, tampoc', async () => {
    const r = await revisaCandidata(env('no tinc ni idea de què em demanes'), {
      title: 'Un titular qualsevol prou llarg',
      reviewSourceContext: 'Some source.',
      body: [],
      topic: 'Ciència',
    })
    expect(r.veredicte).toBe('dubte')
  })
})

describe('la llista del que SÍ que es pot automatitzar', () => {
  it('deixa fora Longevitat sencer: és clínic per definició', () => {
    expect(potDecidirSol({ topic: 'Longevitat', title: 'Un estudi', body: [] }).pot).toBe(
      false,
    )
  })

  it('deixa fora el que Codex va reproduir que s’escapava', () => {
    const fora = [
      ['Ciència', 'La ketamina millora la depressió resistent'],
      ['Tecnologia', 'Una app recull dades escolars dels alumnes'],
      ['Ciència', 'Un terratrèmol deixa desenes de víctimes'],
      ['Tecnologia', 'Una filtració de dades exposa contrasenyes'],
      ['IA', 'El jutge condemna una empresa per frau'],
      ['Tecnologia', 'El govern aprova una llei sobre drets digitals'],
    ]
    for (const [topic, title] of fora) {
      expect(potDecidirSol({ topic, title, body: [] }).pot, title).toBe(false)
    }
  })

  it('un àmbit desconegut tampoc es decideix sol', () => {
    expect(potDecidirSol({ topic: '', title: 'Una peça sense àmbit', body: [] }).pot).toBe(
      false,
    )
    expect(potDecidirSol({ topic: 'Esports', title: 'Un partit', body: [] }).pot).toBe(false)
  })

  it('i deixa passar el que sí que pot decidir sol', () => {
    for (const [topic, title] of [
      ['Astronomia', 'Webb observa una galàxia molt llunyana'],
      ['Filosofia', 'Pensar els desacords com a processos'],
      ['Literatura', 'Un arxiu recupera cartes inèdites'],
    ]) {
      expect(potDecidirSol({ topic, title, body: ['Text.'] }).pot, title).toBe(true)
    }
  })

  it('sempre diu per què, quan diu que no', () => {
    expect(potDecidirSol({ topic: 'Longevitat', title: 'x', body: [] }).motiu).toBeTruthy()
  })
})

describe('sense font no es decideix', () => {
  it('una peça sense material original va a mans d’una persona', async () => {
    // La font s'esborra en reescriure la peça; si no se n'hagués guardat una
    // còpia per a la revisió, la guàrdia es quedava sense res amb què comparar
    // i ho deixava passar tot.
    const r = await revisaCandidata(
      { AI: { run: async () => ({ response: 'VEREDICTE: publicar · MOTIU: bona' }) } },
      { topic: 'Astronomia', title: 'Un titular sense font', body: ['Text.'] },
    )
    expect(r.veredicte).toBe('dubte')
    expect(r.guardia).toBe('sense-font')
  })

  it('la guàrdia atura un nom propi inventat després de la reescriptura', async () => {
    const r = await revisaCandidata(
      { AI: { run: async () => ({ response: 'VEREDICTE: publicar · MOTIU: bona' }) } },
      {
        topic: 'Astronomia',
        title: 'La NASA i Nintendo llancen una missió conjunta',
        reviewSourceContext: 'NASA announced a new mission with European partners.',
        body: ['Text.'],
      },
    )
    expect(r.veredicte).toBe('dubte')
    expect(r.guardia).toBe('fets')
  })
})
