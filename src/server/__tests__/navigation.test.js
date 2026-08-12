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

  it('cada tema resol la seva pàgina pròpia (/tema/<slug>) i torna arrere', () => {
    for (const topic of EDITORIAL_TOPIC_INDEX) {
      // slug → tema → slug: el que fan servir els enllaços de /temes, el
      // sitemap i la resolució de /tema/<slug>.
      expect(getEditorialTopicBySlug(topic.id)?.label, topic.id).toBe(topic.label)
      expect(getEditorialTopicSlug(topic.label), topic.label).toBe(topic.id)
    }
    // Un slug desconegut no resol cap tema (la pàgina mostra "tema no trobat").
    expect(getEditorialTopicBySlug('inexistent')).toBeNull()
  })

  it('exposa els vuit temes del pivot editorial i el seu origen canònic', () => {
    expect(EDITORIAL_TOPIC_INDEX.map((topic) => topic.label)).toEqual([
      'Ciència',
      'Tecnologia',
      'IA',
      'Biotecnologia',
      'Astronomia',
      'Longevitat',
      'Filosofia',
      'Literatura',
    ])
    expect(getEditorialTopicBySlug('longevitat')?.canonicalCategories).toEqual(
      expect.arrayContaining(['Salut']),
    )
    expect(getEditorialTopicSlug('Literatura')).toBe('literatura')
  })
})
