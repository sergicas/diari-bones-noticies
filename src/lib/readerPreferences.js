import { EDITORIAL_TOPIC_INDEX, classifyAllowedEditorialTopic } from './category.js'
import { distanceBandConfig, getDistanceBand } from './distance.js'

export const READER_PREFERENCES_KEY = 'bondiari-reader-preferences-v1'

export const DEFAULT_READER_PREFERENCES = Object.freeze({
  topics: [],
  territories: [],
  showForYou: true,
})

const validTopics = new Set(EDITORIAL_TOPIC_INDEX.map((topic) => topic.id))
const validTerritories = new Set(distanceBandConfig.map((territory) => territory.id))

function uniqueValid(values, allowed) {
  return [...new Set(Array.isArray(values) ? values : [])].filter((value) =>
    allowed.has(value),
  )
}

export function normalizeReaderPreferences(value = {}) {
  return {
    topics: uniqueValid(value.topics, validTopics),
    territories: uniqueValid(value.territories, validTerritories),
    showForYou: value.showForYou !== false,
  }
}

export function loadReaderPreferences(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(READER_PREFERENCES_KEY)
    return raw
      ? normalizeReaderPreferences(JSON.parse(raw))
      : { ...DEFAULT_READER_PREFERENCES }
  } catch {
    return { ...DEFAULT_READER_PREFERENCES }
  }
}

export function saveReaderPreferences(preferences, storage = globalThis.localStorage) {
  const normalized = normalizeReaderPreferences(preferences)
  storage?.setItem(READER_PREFERENCES_KEY, JSON.stringify(normalized))
  return normalized
}

export function hasReaderInterests(preferences) {
  const normalized = normalizeReaderPreferences(preferences)
  return normalized.topics.length > 0 || normalized.territories.length > 0
}

export function getStoryPreferenceMatch(story, preferences) {
  const normalized = normalizeReaderPreferences(preferences)
  const topicLabel = classifyAllowedEditorialTopic(story)
  const topicId = EDITORIAL_TOPIC_INDEX.find((topic) => topic.label === topicLabel)?.id
  const territoryId = getDistanceBand(story).id
  const topic = Boolean(topicId && normalized.topics.includes(topicId))
  const territory = normalized.territories.includes(territoryId)
  return { matches: topic || territory, topic, territory, topicId, territoryId }
}

export function getForYouStories(stories, preferences, limit = 4) {
  if (!hasReaderInterests(preferences) || preferences?.showForYou === false) return []
  return (stories || [])
    .filter((story) => getStoryPreferenceMatch(story, preferences).matches)
    .slice(0, Math.max(0, Math.min(4, Number(limit) || 4)))
}
