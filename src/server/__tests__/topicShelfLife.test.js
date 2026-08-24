import { describe, expect, it } from 'vitest'
import { isStoryWithinLiveWindow } from '../liveNews.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-08-13T12:00:00Z')

function story({ topic, daysOld, editorialFormat } = {}) {
  return {
    topic,
    editorialFormat,
    publishedAt: new Date(NOW - daysOld * DAY).toISOString(),
  }
}

describe('cada àmbit té el seu rellotge', () => {
  it('una notícia general segueix caducant als cinc dies', () => {
    expect(isStoryWithinLiveWindow(story({ daysOld: 4 }), NOW)).toBe(true)
    expect(isStoryWithinLiveWindow(story({ daysOld: 6 }), NOW)).toBe(false)
  })

  it('un estudi de longevitat de sis setmanes encara es pot publicar', () => {
    // El cas que tenia Longevitat buit i en silenci: Europe PMC serveix
    // estudis revisats de fa més d'un mes i el radar els llençava tots.
    expect(isStoryWithinLiveWindow(story({ topic: 'Longevitat', daysOld: 43 }), NOW)).toBe(
      true,
    )
    expect(isStoryWithinLiveWindow(story({ topic: 'Longevitat', daysOld: 61 }), NOW)).toBe(
      false,
    )
  })

  it('els àmbits lents aguanten un mes', () => {
    for (const topic of ['Astronomia', 'Biotecnologia', 'Filosofia', 'Literatura']) {
      expect(isStoryWithinLiveWindow(story({ topic, daysOld: 25 }), NOW)).toBe(true)
      expect(isStoryWithinLiveWindow(story({ topic, daysOld: 31 }), NOW)).toBe(false)
    }
  })

  it('els àmbits ràpids caduquen abans', () => {
    for (const topic of ['IA', 'Tecnologia']) {
      expect(isStoryWithinLiveWindow(story({ topic, daysOld: 9 }), NOW)).toBe(true)
      expect(isStoryWithinLiveWindow(story({ topic, daysOld: 11 }), NOW)).toBe(false)
    }
    expect(isStoryWithinLiveWindow(story({ topic: 'Ciència', daysOld: 13 }), NOW)).toBe(true)
    expect(isStoryWithinLiveWindow(story({ topic: 'Ciència', daysOld: 15 }), NOW)).toBe(false)
  })

  it('un tema desconegut no allarga res', () => {
    expect(isStoryWithinLiveWindow(story({ topic: 'Esports', daysOld: 6 }), NOW)).toBe(false)
  })

  it('el format editorial explícit continua manant per damunt del tema', () => {
    // Les dades obertes duren un any encara que el tema sigui dels ràpids.
    expect(
      isStoryWithinLiveWindow(
        story({ topic: 'Tecnologia', editorialFormat: 'data', daysOld: 200 }),
        NOW,
      ),
    ).toBe(true)
  })
})
