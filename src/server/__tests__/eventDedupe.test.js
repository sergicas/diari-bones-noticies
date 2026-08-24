import { describe, expect, it } from 'vitest'
import { agrupaPerEsdeveniment, mateixEsdeveniment } from '../../lib/event-dedupe.js'

// AGRUPAR, NO DESCARTAR.
//
// La primera versió d'això suprimia les peces que semblaven repetides. Era un
// camí de pèrdua silenciosa: la descartada no arribava a la sala, es marcava
// com a vista durant catorze dies i desapareixia sense que ningú l'hagués
// llegida. I el criteri confonia l'eclipsi del 2026 amb el del 2027.

const eclipsi = [
  { id: 'a', title: "Un eclipsi solar total visible des d'Espanya el 2026" },
  { id: 'b', title: 'Un eclipsi solar total en un camp de gira-sols' },
  {
    id: 'c',
    title:
      'Una expedició astronòmica fotografia un eclipsi solar total des de Groenlàndia',
  },
]

describe('agrupació per esdeveniment', () => {
  it('no descarta res: totes les peces hi arriben', () => {
    const out = agrupaPerEsdeveniment(eclipsi)
    expect(out).toHaveLength(3)
    expect(out.every((s) => s.title)).toBe(true)
  })

  it('marca les sospitoses amb la representant, sense amagar-les', () => {
    const out = agrupaPerEsdeveniment(eclipsi)
    // La representant no en té cap: el camp es NETEJA sempre, també per a
    // ella, perquè cap marca antiga no sobrevisqui a una reagrupació.
    expect(out[0].possibleDuplicateOf).toBeFalsy()
    expect(out[1].possibleDuplicateOf).toBe('a')
    expect(out[2].possibleDuplicateOf).toBe('a')
  })

  it('DOS ANYS DIFERENTS NO SÓN EL MATEIX FET', () => {
    // Reproduït per Codex: els dos titulars només es diferencien en l'any i la
    // resta de mots són idèntics. Sense aquesta regla es prenien per la
    // mateixa notícia i una desapareixia.
    const a = { id: '2026', title: 'Un eclipsi solar total serà visible a Espanya el 2026' }
    const b = { id: '2027', title: 'Un eclipsi solar total serà visible a Espanya el 2027' }
    expect(mateixEsdeveniment(a, b)).toBe(false)
    const out = agrupaPerEsdeveniment([a, b])
    expect(out[1].possibleDuplicateOf).toBeFalsy()
  })

  it('xifres diferents en general separen fets', () => {
    expect(
      mateixEsdeveniment(
        { title: 'La missió arriba a 300 quilòmetres del cometa' },
        { title: 'La missió arriba a 900 quilòmetres del cometa' },
      ),
    ).toBe(false)
  })

  it('una peça amb xifra i una altra sense poden ser el mateix fet', () => {
    expect(
      mateixEsdeveniment(
        { title: "Un eclipsi solar total visible des d'Espanya el 2026" },
        { title: 'Un eclipsi solar total fotografiat des de Groenlàndia' },
      ),
    ).toBe(true)
  })

  it('no ajunta peces que només comparteixen el tema', () => {
    const out = agrupaPerEsdeveniment([
      { id: 'x', title: 'Un observatori a Nou Mèxic permet veure el cel de fa mil·lennis' },
      { id: 'y', title: 'Webb detecta aigua i pols prop del forat negre central' },
    ])
    expect(out[1].possibleDuplicateOf).toBeFalsy()
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

  it('cada peça agrupada segueix sent independent per aprovar o rebutjar', () => {
    // Res del que fa l'agrupació no toca la identitat de la peça: qui revisa
    // pot aprovar-ne una i rebutjar-ne l'altra, o totes dues.
    const out = agrupaPerEsdeveniment(eclipsi)
    expect(out.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(out[1].title).toBe(eclipsi[1].title)
  })

  it('no peta amb titulars buits', () => {
    expect(agrupaPerEsdeveniment([{ title: '' }, { title: null }, {}])).toHaveLength(3)
  })
})

describe('cap marca antiga no sobreviu a una reagrupació', () => {
  it('esborra el que hi hagués desat, també a les representants', () => {
    // Persistir l'agrupació la deixava congelada: si la representant sortia de
    // la sala, la seguidora es quedava apuntant a algú que ja no hi era i
    // desapareixia del render. Ara el camp es recalcula sempre de zero.
    const out = agrupaPerEsdeveniment([
      {
        id: 'a',
        title: 'Una biblioteca del Prat obre els diumenges a la tarda',
        possibleDuplicateOf: 'fantasma',
      },
      {
        id: 'b',
        title: 'Webb detecta aigua i pols prop del forat negre central',
        possibleDuplicateOf: 'fantasma',
      },
    ])
    expect(out[0].possibleDuplicateOf).toBeFalsy()
    expect(out[1].possibleDuplicateOf).toBeFalsy()
  })

  it('no deixa mai una marca que apunti a algú que no és a la llista', () => {
    const out = agrupaPerEsdeveniment([
      { id: 'a', title: "Un eclipsi solar total visible des d'Espanya" },
      { id: 'b', title: 'Un eclipsi solar total fotografiat des de Groenlàndia', possibleDuplicateOf: 'fantasma' },
    ])
    const ids = new Set(out.map((s) => s.id))
    for (const s of out) {
      if (s.possibleDuplicateOf) expect(ids.has(s.possibleDuplicateOf)).toBe(true)
    }
  })
})
