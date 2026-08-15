import { describe, expect, it, vi } from 'vitest'
import {
  dadesSenseSuport,
  esSensible,
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
        sourceContext: 'The mission approached within 300 kilometres of the comet.',
      }),
    ).toContain('900')
  })

  it('deixa passar una xifra que sí que hi és', () => {
    expect(
      dadesSenseSuport({
        title: 'La missió arriba a 300 quilòmetres del cometa',
        sourceContext: 'The mission approached within 300 kilometres of the comet.',
      }),
    ).toHaveLength(0)
  })

  it('atura un nom propi inventat', () => {
    expect(
      dadesSenseSuport({
        title: 'La NASA i Nintendo llancen un observatori conjunt',
        sourceContext: 'NASA announced a new observatory built with European partners.',
      }),
    ).toContain('Nintendo')
  })

  it('NO marca paraules corrents pel fet que la font sigui en anglès', () => {
    // El primer intent comparava mot a mot un titular català amb una font
    // anglesa i marcava "permet" i "mil·lennis" com a inventats. Inservible.
    expect(
      dadesSenseSuport({
        title: 'Un observatori a Nou Mèxic permet veure el cel de fa mil·lennis',
        sourceContext:
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
    expect(
      esSensible({ title: 'Webb detecta aigua prop del centre galàctic', body: [] }),
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
        sourceContext: 'FDA approves drug for relapsed or refractory multiple myeloma.',
        body: ['Un text.'],
      },
    )
    expect(r.veredicte).toBe('dubte')
    expect(r.guardia).toBe('sensible')
  })

  it('una xifra inventada tampoc, digui el que digui l’IA', async () => {
    const r = await revisaCandidata(env('VEREDICTE: publicar · MOTIU: molt bona'), {
      title: 'El telescopi observa 900 galàxies noves en una nit',
      sourceContext: 'The telescope observed 300 new galaxies in a single night.',
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
        sourceContext: 'A new observatory lets astronomers reconstruct ancient skies.',
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
        sourceContext: 'Companies are looking for reliable data.',
        body: ['Un text.'],
      },
    )
    expect(r.veredicte).toBe('descartar')
  })

  it('si l’IA falla, no decideix: ho deixa per a una persona', async () => {
    const r = await revisaCandidata(
      { AI: { run: async () => { throw new Error('IA caiguda') } } },
      { title: 'Un titular qualsevol prou llarg', sourceContext: 'Some source.', body: [] },
    )
    expect(r.veredicte).toBe('dubte')
  })

  it('si la resposta no s’entén, tampoc', async () => {
    const r = await revisaCandidata(env('no tinc ni idea de què em demanes'), {
      title: 'Un titular qualsevol prou llarg',
      sourceContext: 'Some source.',
      body: [],
    })
    expect(r.veredicte).toBe('dubte')
  })
})
