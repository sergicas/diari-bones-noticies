import { describe, expect, it } from 'vitest'
import { canInterceptNavigation, getStoryPath } from '../../lib/navigation.js'
import {
  EDITORIAL_TOPIC_INDEX,
  getEditorialTopicBySlug,
  getEditorialTopicSlug,
  normalizeCategory,
} from '../../lib/category.js'

describe('navigation and category helpers', () => {
  it('getStoryPath encodes story ID correctly', () => {
    expect(getStoryPath('feed-123')).toBe('/noticia/feed-123')
    expect(getStoryPath('test/story id')).toBe('/noticia/test%2Fstory%20id')
  })

  it('canInterceptNavigation detects standard primary click without modifier keys', () => {
    const standardClick = {
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    }
    const rightClick = { ...standardClick, button: 2 }
    const ctrlClick = { ...standardClick, ctrlKey: true }
    const defaultPreventedClick = { ...standardClick, defaultPrevented: true }

    expect(canInterceptNavigation(standardClick)).toBe(true)
    expect(canInterceptNavigation(rightClick)).toBe(false)
    expect(canInterceptNavigation(ctrlClick)).toBe(false)
    expect(canInterceptNavigation(defaultPreventedClick)).toBe(false)
  })

  it('normalizeCategory maps RSS tags to canonical categories', () => {
    expect(normalizeCategory('politics')).toBe('Política')
    expect(normalizeCategory('cultura')).toBe('Cultura')
    expect(normalizeCategory('health')).toBe('Salut')
    expect(normalizeCategory('climate')).toBe('Medi ambient')
    expect(normalizeCategory('unknown-tag')).toBe('Actualitat')
  })

  it('exposes the eight public topics with the requested culture index', () => {
    expect(EDITORIAL_TOPIC_INDEX.map((topic) => topic.label)).toEqual([
      'Cultura',
      'Esports',
      'Ciència',
      'Tecnologia',
      'Societat',
      'Religió',
      'Solidaritat',
      'Educació',
    ])
    expect(getEditorialTopicBySlug('cultura')?.subtopics).toEqual(
      expect.arrayContaining(['Música', 'Literatura', 'Teatre']),
    )
    expect(getEditorialTopicSlug('Educació')).toBe('educacio')
  })
})
