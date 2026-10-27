import { describe, expect, it } from 'vitest'
import {
  isLeadHumanitiesStory,
  prioritizeLiteratureAndPhilosophy,
} from '../../lib/story-order.js'

const byNewestFirst = (left, right) =>
  new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()

const portadaOrder = prioritizeLiteratureAndPhilosophy(byNewestFirst)

describe('prioritat de Literatura i Filosofia', () => {
  it('posa els dos temes abans que qualsevol altra notícia', () => {
    const stories = [
      { id: 'ciencia', topic: 'Ciència', publishedAt: '2026-09-08T12:00:00Z' },
      { id: 'literatura', topic: 'Literatura', publishedAt: '2026-09-07T12:00:00Z' },
      { id: 'filosofia', topic: 'Filosofia', publishedAt: '2026-09-06T12:00:00Z' },
      { id: 'tecnologia', topic: 'Tecnologia', publishedAt: '2026-09-09T12:00:00Z' },
    ]

    expect([...stories].sort(portadaOrder).map((story) => story.id)).toEqual([
      'literatura',
      'filosofia',
      'tecnologia',
      'ciencia',
    ])
  })

  it('manté l’ordre per data dins de cada grup de prioritat', () => {
    const stories = [
      { id: 'filosofia-vella', topic: 'Filosofia', publishedAt: '2026-09-06T12:00:00Z' },
      { id: 'literatura-nova', topic: 'Literatura', publishedAt: '2026-09-08T12:00:00Z' },
      { id: 'ciencia-vella', topic: 'Ciència', publishedAt: '2026-09-05T12:00:00Z' },
      { id: 'tecnologia-nova', topic: 'Tecnologia', publishedAt: '2026-09-09T12:00:00Z' },
    ]

    expect([...stories].sort(portadaOrder).map((story) => story.id)).toEqual([
      'literatura-nova',
      'filosofia-vella',
      'tecnologia-nova',
      'ciencia-vella',
    ])
  })

  it('només aplica la prioritat quan el tema editorial està desat explícitament', () => {
    expect(isLeadHumanitiesStory({ topic: 'Literatura' })).toBe(true)
    expect(isLeadHumanitiesStory({ topic: 'Filosofia' })).toBe(true)
    expect(isLeadHumanitiesStory({ category: 'Cultura', title: 'Un llibre nou' })).toBe(false)
  })
})
