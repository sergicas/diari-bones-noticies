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
    for (const name of ['Phys.org', 'EurekAlert!', 'Quanta Magazine', 'MIT Technology Review', 'Aeon', 'Psyche', 'Literary Hub', 'Public Domain Review']) {
      expect(byName.get(name)?.circuit, name).toBe('B')
    }
    expect(byName.has('esa.int')).toBe(false)
    expect(byName.has('NOIRLab')).toBe(false)
  })

  // El sostre per llengua de la portada fa que només el català (sense límit) i
  // el castellà (fins a 6) puguin fer créixer l'edició; l'anglès es queda en 3 i
  // el francès, l'italià i el portuguès en 1. Per això aquestes dues llengües es
  // consulten SENCERES a cada passada i la resta segueix rotant.
  it('consulta totes les fonts en català i en castellà a cada passada', () => {
    const dotzeHores = 12 * 60 * 60 * 1000
    const esperatCa = rssFeeds.filter((f) => f.language === 'ca').map((f) => f.name)
    const esperatEs = rssFeeds.filter((f) => f.language === 'es').map((f) => f.name)

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

  it('segueix rotant les llengües amb sostre, sense baixar-les totes', () => {
    const seleccio = selectFeedsForRun(Date.now())
    const angleses = seleccio.filter((f) => f.language === 'en')
    const totalAngleses = rssFeeds.filter((f) => f.language === 'en')
    expect(angleses.length).toBeLessThan(totalAngleses.length)
    // Prou contingut per omplir el sostre de 3 peces en anglès.
    expect(angleses.length).toBeGreaterThanOrEqual(3)
  })

  it('includes service feeds in allowedSourceNames', () => {
    expect(allowedSourceNames.has('Agenda Cultural')).toBe(true)
    expect(allowedSourceNames.has('Dades Obertes de Catalunya · RAISC')).toBe(true)
    expect(allowedSourceNames.has('Idescat')).toBe(true)
  })
})
