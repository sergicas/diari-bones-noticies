import { describe, expect, it } from 'vitest'
import { dedupePerEsdeveniment, mateixEsdeveniment } from '../../lib/event-dedupe.js'

// La sala va rebre alhora TRES peces del mateix eclipsi solar, de fonts
// diferents. Cap era duplicada per URL. Per a qui revisa és soroll: llegir tres
// vegades el mateix per acabar aprovant-ne una.

const eclipsi = [
  { title: "Un eclipsi solar total visible des d'Espanya el 2026" },
  { title: 'Un eclipsi solar total en un camp de gira-sols' },
  {
    title:
      'Una expedició astronòmica fotografia un eclipsi solar total des de Groenlàndia',
  },
]

describe('deduplicació per esdeveniment', () => {
  it('ajunta les tres peces del mateix eclipsi', () => {
    const { quedades, descartades } = dedupePerEsdeveniment(eclipsi)
    expect(quedades).toHaveLength(1)
    expect(descartades).toHaveLength(2)
    expect(quedades[0].title).toContain("d'Espanya")
  })

  it('no ajunta peces que només comparteixen el tema', () => {
    // Totes dues són d'astronomia i tenen mots en comú, però expliquen fets
    // diferents. Ajuntar-les perdria informació, que és el pitjor error.
    const { quedades } = dedupePerEsdeveniment([
      { title: 'Un observatori a Nou Mèxic permet veure el cel de fa 13.000 anys' },
      { title: 'Webb detecta aigua i pols prop del forat negre central de la galàxia' },
    ])
    expect(quedades).toHaveLength(2)
  })

  it('no ajunta dos titulars llargs amb tres mots comuns per casualitat', () => {
    expect(
      mateixEsdeveniment(
        {
          title:
            'La recerca científica sobre materials avançats obre camins per a la indústria europea',
        },
        {
          title:
            'La recerca científica sobre longevitat cel·lular avança en models animals de laboratori',
        },
      ),
    ).toBe(false)
  })

  it('respecta l’ordre: es queda la primera', () => {
    const { quedades } = dedupePerEsdeveniment([eclipsi[2], eclipsi[0], eclipsi[1]])
    expect(quedades[0].title).toContain('Groenlàndia')
  })

  it('no peta amb titulars buits', () => {
    const { quedades } = dedupePerEsdeveniment([{ title: '' }, { title: null }, {}])
    expect(quedades).toHaveLength(3)
  })
})
