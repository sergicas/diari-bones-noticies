import { describe, it, expect } from 'vitest'
import { rssFeeds, allowedSourceNames } from '../rss/feedsConfig.js'

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

  it('includes service feeds in allowedSourceNames', () => {
    expect(allowedSourceNames.has('Agenda Cultural')).toBe(true)
    expect(allowedSourceNames.has('Dades Obertes de Catalunya · RAISC')).toBe(true)
    expect(allowedSourceNames.has('Idescat')).toBe(true)
  })
})
