import { describe, it, expect } from 'vitest'
import {
  rssFeeds,
  allowedSourceNames,
  selectFeedsForRun,
} from '../rss/feedsConfig.js'

describe('rssFeeds catalog integrity', () => {
  it('manté un catàleg ampli sense convertir el volum en objectiu editorial', () => {
    expect(rssFeeds.length).toBeGreaterThanOrEqual(50)
    const feedNames = rssFeeds.map((feed) => feed.name)
    expect(feedNames).not.toContain('ARA')
    expect(feedNames).not.toContain('La Vanguardia')
  })

  it('includes essential core and science/tech feeds', () => {
    const feedNames = rssFeeds.map((f) => f.name)
    expect(feedNames).toContain('Science Daily')
    expect(feedNames).toContain('Phys.org')
    expect(feedNames).toContain('BBC Science')
    expect(feedNames).toContain('TechCrunch')
    expect(feedNames).toContain('The Verge')
    expect(feedNames).toContain('France 24')
    expect(feedNames).toContain('CNN Portugal')
    expect(feedNames).toContain('ANSA Cultura')
    expect(feedNames).toContain('Vilaweb')
    expect(feedNames).toContain('Nació Digital')
  })

  it('declara inequívocament els circuits i drets de les fonts del pivot', () => {
    const byName = new Map(rssFeeds.map((feed) => [feed.name, feed]))
    for (const name of ['NASA', 'ESO', 'ESA/Hubble', 'ESA/Webb', 'PLOS Biology', 'PLOS ONE', 'NIH Research Matters']) {
      const feed = byName.get(name)
      expect(feed?.circuit, name).toBe('A')
      expect(feed?.activation?.licenseConfirmed, name).toBe(true)
      expect(feed?.licenseProofUrl, name).toMatch(/^https:\/\//)
      expect(feed?.imageRights?.license, name).toBeTruthy()
    }
    for (const name of ['Phys.org', 'Quanta Magazine', 'MIT Technology Review', 'Aeon', 'Psyche', 'Daily Nous', 'Literary Hub', 'The Paris Review', 'Electric Literature', 'Public Domain Review', 'STAT']) {
      expect(byName.get(name)?.circuit, name).toBe('B')
    }
    expect(byName.get('Europe PMC · Longevitat')).toMatchObject({
      circuit: 'A',
      sourceTopic: 'Longevitat',
      format: 'europe-pmc-search',
    })
    expect(byName.get('Psyche')?.sourceTopic).toBe('Filosofia')
    expect(byName.get('Daily Nous')?.sourceTopic).toBe('Filosofia')
    expect(byName.get('Aeon')?.sourceTopic).toBeUndefined()
    expect(byName.get('Literary Hub')?.sourceTopic).toBe('Literatura')
    expect(byName.get('The Paris Review')?.sourceTopic).toBe('Literatura')
    expect(byName.get('Electric Literature')?.sourceTopic).toBe('Literatura')
    expect(byName.get('Public Domain Review')?.sourceTopic).toBe('Literatura')
    expect(byName.get('NIH Research Matters')?.enabled).toBe(false)
    expect(byName.has('EurekAlert!')).toBe(false)
    expect(byName.has('esa.int')).toBe(false)
    expect(byName.has('NOIRLab')).toBe(false)
  })

  it('amplia el radar amb fonts editorials originals sense reobrir generalistes', () => {
    const byName = new Map(rssFeeds.map((feed) => [feed.name, feed]))
    const ampliades = [
      'Mètode', 'Diari de la Sanitat', 'Casal dels Infants', "Diari de l'Educació",
      'The Conversation (ES)', 'Positive News', 'Good News Network',
      'Reasons to be Cheerful', 'The Conversation', 'Science Daily',
      'BBC Science', 'Guardian Science', 'BBC Technology', 'Guardian Culture',
      'Smithsonian',
    ]

    for (const name of ampliades) {
      expect(byName.get(name), name).toMatchObject({
        circuit: 'B',
        activation: { required: true, licenseConfirmed: true },
      })
      expect(byName.get(name)?.enabled, name).not.toBe(false)
    }

    expect(rssFeeds.filter((feed) => feed.enabled !== false)).toHaveLength(33)
  })

  // El sostre per llengua de la portada fa que només el català (sense límit) i
  // el castellà (fins a 6) puguin fer créixer l'edició; l'anglès es queda en 3 i
  // el francès, l'italià i el portuguès en 1. Per això aquestes dues llengües es
  // consulten SENCERES a cada passada i la resta segueix rotant.
  it('consulta totes les fonts en català i en castellà a cada passada', () => {
    const dotzeHores = 12 * 60 * 60 * 1000
    // Només les ENCESES: des del gir editorial, les fonts generalistes es
    // queden al catàleg apagades (vegeu NOMES_FONTS_DEL_GIR a feedsConfig).
    const esperatCa = rssFeeds
      .filter((f) => f.language === 'ca' && f.enabled !== false)
      .map((f) => f.name)
    const esperatEs = rssFeeds
      .filter((f) => f.language === 'es' && f.enabled !== false)
      .map((f) => f.name)

    for (let finestra = 0; finestra < 4; finestra += 1) {
      const noms = selectFeedsForRun(Date.now() + finestra * dotzeHores).map(
        (f) => f.name,
      )
      for (const nom of [...esperatCa, ...esperatEs]) {
        expect(noms, `finestra ${finestra}: falta ${nom}`).toContain(nom)
      }
      expect(new Set(noms).size, `finestra ${finestra}: fonts duplicades`).toBe(
        noms.length,
      )
    }
  })

  it('cap font encesa no es queda sense consultar, i el sostre de peticions es respecta', () => {
    // Aquesta prova abans deia "sense baixar-les totes" i passava comparant amb
    // fonts APAGADES, o sigui per la raó equivocada. El que de debò ha de ser
    // cert són dues coses alhora: que cap font encesa quedi fora en silenci
    // —amb el gir, rotar les 15 hauria fet que Europe PMC, l'única font de
    // Longevitat, es consultés un cop per setmana— i que la selecció no es
    // dispari mai per damunt del sostre de subpeticions del pla gratuït.
    const enceses = rssFeeds.filter((f) => f.enabled !== false)
    const seleccio = selectFeedsForRun(Date.now())
    const noms = new Set(seleccio.map((f) => f.name))

    for (const feed of enceses) {
      expect(noms, `falta ${feed.name}`).toContain(feed.name)
    }
    expect(seleccio.length).toBeLessThanOrEqual(40)
    expect(noms.size).toBe(seleccio.length)
  })

  it('includes service feeds in allowedSourceNames', () => {
    expect(allowedSourceNames.has('Agenda Cultural')).toBe(true)
    expect(allowedSourceNames.has('Dades Obertes de Catalunya · RAISC')).toBe(true)
    expect(allowedSourceNames.has('Idescat')).toBe(true)
  })
})
