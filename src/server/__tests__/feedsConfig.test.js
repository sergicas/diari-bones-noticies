import { describe, it, expect } from 'vitest'
import { rssFeeds, allowedSourceNames } from '../rss/feedsConfig.js'

describe('rssFeeds catalog integrity', () => {
  it('contains at least 70 RSS feeds', () => {
    expect(rssFeeds.length).toBeGreaterThanOrEqual(70)
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
