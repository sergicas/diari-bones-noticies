import { describe, expect, it } from 'vitest'
import { buildArchiveSitemap } from '../archiveSitemap.js'
import { feedStoryId } from '../../lib/story-id.js'

describe('buildArchiveSitemap', () => {
  it('genera una entrada per peça amb l’URL canònica', () => {
    const url = 'https://exemple.cat/peca-arxiu'
    const xml = buildArchiveSitemap([
      { title: 'Peça d’arxiu', url, publishedAt: '2026-01-15T10:00:00Z' },
    ])
    expect(xml).toContain('<urlset')
    expect(xml).toContain(
      `<loc>https://bondiari.com/noticia/${feedStoryId(url)}</loc>`,
    )
    expect(xml).toContain('<lastmod>2026-01-15</lastmod>')
  })

  it('respecta el slug propi de les peces llavor', () => {
    const xml = buildArchiveSitemap([
      { id: 'el-prat-101', title: 'Llavor', url: 'https://x/a' },
    ])
    expect(xml).toContain('<loc>https://bondiari.com/noticia/el-prat-101</loc>')
  })

  it('descarta peces sense títol o sense URL i deduplica', () => {
    const url = 'https://exemple.cat/repetida'
    const xml = buildArchiveSitemap([
      { title: 'Sense URL' },
      { url: 'https://x/sense-titol' },
      { title: 'Bona', url },
      { title: 'Bona (còpia)', url },
    ])
    const matches = xml.match(/<loc>/g) || []
    expect(matches).toHaveLength(1)
  })

  it('no peta amb una llista buida', () => {
    const xml = buildArchiveSitemap([])
    expect(xml).toContain('<urlset')
    expect(xml).toContain('</urlset>')
  })
})
