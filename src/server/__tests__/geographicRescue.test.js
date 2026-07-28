import { describe, it, expect } from 'vitest'
import { selectGeographicRescue, getDistanceBand } from '../../lib/distance.js'

// Peces de prova amb topònims que fixen el nivell geogràfic.
const mataro = { id: 'm1', title: 'Mataró estrena una escola', publishedAt: '2026-07-27' }
const catalunya = { id: 'c1', title: 'Girona obre un museu', publishedAt: '2026-07-26' }
const estat = { id: 'e1', title: 'Sevilla estrena un tramvia', publishedAt: '2026-07-10' }
const europa = { id: 'u1', title: 'Lisboa amplia el carril bici', publishedAt: '2026-07-09' }
const mon1 = { id: 'w1', title: 'Un poble del Japó recupera la seva escola', publishedAt: '2026-07-08' }
const mon2 = { id: 'w2', title: 'Investigadors del CSIC estalvien aigua a l’arròs', publishedAt: '2026-07-07' }

describe('rescat geogràfic — els nivells de fora no queden buits', () => {
  it('omple els nivells sense actualitat recent amb peces de l’arxiu', () => {
    // Recent: només Catalunya i Mataró. L’arxiu té Estat, Europa i Món.
    const recents = [mataro, catalunya]
    const arxiu = [estat, europa, mon1, mon2]

    // Nivell "Món" (maxRank 5): s’han d’omplir Estat, Europa i Món.
    const rescue = selectGeographicRescue(recents, arxiu, 5)
    const bands = rescue.map((s) => getDistanceBand(s).label).sort()
    expect(bands).toEqual(['Estat Espanyol', 'Europa', 'Món', 'Món'])
  })

  it('no rescata un nivell que ja té actualitat recent', () => {
    // Ja hi ha una peça recent d’Estat: no s’hi ha d’afegir la de l’arxiu.
    const recents = [catalunya, { id: 'e-fresc', title: 'Madrid obre un parc', publishedAt: '2026-07-27' }]
    const arxiu = [estat, mon1]
    const rescue = selectGeographicRescue(recents, arxiu, 5)
    expect(rescue.map((s) => s.id)).toEqual(['w1']) // només el Món, no l’Estat
  })

  it('no passa del nivell triat (Catalunya no rescata Món)', () => {
    const recents = [catalunya]
    const arxiu = [estat, europa, mon1]
    // maxRank 2 = Catalunya: res de fora no entra.
    expect(selectGeographicRescue(recents, arxiu, 2)).toEqual([])
  })

  it('acota quantes peces de cada nivell rescata', () => {
    const recents = [catalunya]
    const molts = Array.from({ length: 20 }, (_, i) => ({
      id: `w${i}`,
      title: 'Un projecte comunitari al món',
      publishedAt: '2026-07-01',
    }))
    const rescue = selectGeographicRescue(recents, molts, 5, 6)
    expect(rescue.length).toBe(6)
  })
})
