import { describe, expect, it } from 'vitest'
import { assignEditorialTopic } from '../../lib/category.js'

// DUES CLASSIFICACIONS FALSES DE MANUAL (reproduïdes per Codex el 14-08-2026).
//
// El vocabulari de Filosofia i Literatura és massa comú en textos científics i
// sanitaris, i les regles per contingut el llegien fora de context:
//   · "novel drug class" → Literatura, perquè "novel" hi és com a adjectiu
//     anglès i la regla el prenia per "novel·la".
//   · "medical ethics" dins d'una peça sanitària → Filosofia, per "ethics".
//
// Ara aquests dos temes només s'assignen per contingut si la peça ja ve d'un
// context humanístic. El mapatge per font (Psyche, Aeon, Literary Hub, Public
// Domain Review) NO passa per aquí i ha de seguir intacte.

describe('el classificador no confon vocabulari comú', () => {
  it('un fàrmac "novel" no és Literatura', () => {
    const topic = assignEditorialTopic({
      title: 'FDA approves a novel drug class for advanced multiple myeloma',
      summary: 'Regulators cleared the novel oral treatment after a phase 3 trial.',
      source: 'STAT',
      category: 'Salut',
      circuit: 'B',
    })
    expect(topic).not.toBe('Literatura')
  })

  it('"medical ethics" dins d’una peça sanitària no és Filosofia', () => {
    const topic = assignEditorialTopic({
      title: 'Patients weigh in on minimally invasive brain implants',
      summary:
        'Researchers discuss medical ethics and consent around neural implants for depression.',
      source: 'STAT',
      category: 'Salut',
      circuit: 'B',
    })
    expect(topic).not.toBe('Filosofia')
  })

  it('Psyche segueix donant Filosofia', () => {
    expect(
      assignEditorialTopic({
        title: 'How to think like a Hegelian',
        source: 'Psyche',
        circuit: 'B',
      }),
    ).toBe('Filosofia')
  })

  it('Literary Hub i Public Domain Review segueixen donant Literatura', () => {
    for (const source of ['Literary Hub', 'Public Domain Review']) {
      expect(
        assignEditorialTopic({ title: 'Una peça sobre revistes', source, circuit: 'B' }),
        `${source} hauria de donar Literatura`,
      ).toBe('Literatura')
    }
  })

  it('una peça de Cultura sí que pot ser Literatura pel contingut', () => {
    // El context humanístic no és només la font: la categoria d'ingesta també
    // val, o perdríem peces legítimes de cultura.
    expect(
      assignEditorialTopic({
        title: 'Una novel·la pòstuma arriba a les llibreries',
        summary: 'L’obra de l’escriptora es publica quaranta anys després.',
        source: 'Font cultural',
        category: 'Cultura',
      }),
    ).toBe('Literatura')
  })

  it('un tema explícit de l’editora mana per damunt de tot', () => {
    expect(
      assignEditorialTopic({
        title: 'FDA approves a novel drug class',
        source: 'STAT',
        category: 'Salut',
        topic: 'Biotecnologia',
      }),
    ).toBe('Biotecnologia')
  })
})
