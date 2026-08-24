import { describe, expect, it } from 'vitest'
import {
  getForYouStories,
  getStoryPreferenceMatch,
  loadReaderPreferences,
  normalizeReaderPreferences,
  saveReaderPreferences,
} from '../../lib/readerPreferences.js'

const science = {
  id: 'science',
  title: 'Un telescopi observa una galàxia',
  summary: 'Nova recerca científica',
  category: 'Ciència',
  topic: 'Ciència',
  location: 'Barcelona',
}
const literature = {
  id: 'literature',
  title: 'Una nova novel·la catalana',
  summary: 'Literatura contemporània',
  category: 'Cultura',
  topic: 'Literatura',
  location: 'Girona',
}

describe('reader preferences', () => {
  it('normalizes unknown values and remains local to the provided storage', () => {
    const values = new Map()
    const storage = {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    }
    saveReaderPreferences(
      { topics: ['ciencia', 'desconegut'], territories: ['catalunya', 'x'], showForYou: false },
      storage,
    )
    expect(loadReaderPreferences(storage)).toEqual({
      topics: ['ciencia'],
      territories: ['catalunya'],
      showForYou: false,
    })
    expect(normalizeReaderPreferences({ topics: 'ciencia' }).topics).toEqual([])
  })

  it('marks matching stories without changing their editorial order', () => {
    const preferences = { topics: ['literatura'], territories: [], showForYou: true }
    expect(getStoryPreferenceMatch(literature, preferences).matches).toBe(true)
    expect(getStoryPreferenceMatch(science, preferences).matches).toBe(false)
    expect(getForYouStories([science, literature], preferences).map((story) => story.id)).toEqual([
      'literature',
    ])
  })

  it('limits the repeated selection to four stories', () => {
    const stories = Array.from({ length: 6 }, (_, index) => ({ ...science, id: String(index) }))
    expect(getForYouStories(stories, { topics: ['ciencia'], territories: [], showForYou: true })).toHaveLength(4)
  })
})
