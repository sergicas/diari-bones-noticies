import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// El prompt del filtre no es pot provar cridant el model, però sí que es pot
// vigilar que no torni a descriure un diari que ja no existeix. Quan es va fer
// el gir editorial, el prompt es va quedar dient que El Bon Diari publicava
// Esports, Societat, Religió i Solidaritat: la línia d'abans del gir. Ningú
// no se'n va adonar durant dies perquè res no fallava.
const font = readFileSync(
  new URL('../liveNews.js', import.meta.url),
  'utf8',
)
const prompt = font.slice(
  font.indexOf('const AI_SYSTEM_BATCH'),
  font.indexOf("].join(' ')", font.indexOf('const AI_SYSTEM_BATCH')),
)

const AMBITS = [
  'Ciència',
  'Tecnologia',
  'IA',
  'Biotecnologia',
  'Astronomia',
  'Longevitat',
  'Filosofia',
  'Literatura',
]

describe('el filtre sap quin diari és', () => {
  it('anomena els vuit àmbits del gir editorial', () => {
    for (const ambit of AMBITS) {
      expect(prompt, `falta l'àmbit ${ambit}`).toContain(ambit)
    }
  })

  it('no descriu la línia editorial anterior al gir', () => {
    for (const vell of ['Esports', 'Societat', 'Religió', 'Solidaritat', 'Educació']) {
      expect(prompt, `encara hi surt ${vell} com a àmbit`).not.toContain(
        `${vell},`,
      )
    }
  })

  it('demana troballes i rebutja intencions', () => {
    // El criteri que va sortir de la primera revisió humana: les dues peces
    // descartades explicaven converses i plans, no res que hagués passat.
    expect(prompt).toContain('TROBALLA')
    expect(prompt).toContain('INTENCIONS')
    for (const paraula of ['converses', 'plans', 'inverteixen']) {
      expect(prompt, `falta el senyal de procés "${paraula}"`).toContain(paraula)
    }
  })

  it('davant del dubte, no publica', () => {
    expect(prompt).toContain('En cas de DUBTE, respon NO')
  })
})
