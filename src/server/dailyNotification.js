import { feedStoryId } from '../lib/story-id.js'
import { classifyAllowedEditorialTopic } from '../lib/category.js'

function finiteScore(value) {
  const score = Number(value)
  return Number.isFinite(score) ? score : null
}

export function notificationImpactScore(story) {
  const explicit = [
    story?.impactScore,
    story?.editorialImpactScore,
    story?.positiveScore,
    story?.editorialScore,
  ]
    .map(finiteScore)
    .find((score) => score !== null)
  return explicit ?? 0
}

export function notificationStoryId(story) {
  return story?.id || feedStoryId(story?.url || story?.title || '')
}

/**
 * Jutge de «La peça del dia»:
 * 1. guanya la puntuació d'impacte editorial més alta;
 * 2. a igualtat, es prefereix una categoria diferent de la del dia anterior;
 * 3. si l'empat continua, es conserva l'ordre de l'edició del matí.
 */
export function selectDailyNotificationStory(stories, previousCategory = null) {
  const ranked = (stories || []).map((story, position) => ({
    story,
    position,
    score: notificationImpactScore(story),
    category: classifyAllowedEditorialTopic(story) || story?.category || null,
  }))
  if (ranked.length === 0) return null
  const bestScore = Math.max(...ranked.map((candidate) => candidate.score))
  const tied = ranked.filter((candidate) => candidate.score === bestScore)
  const diverse = previousCategory
    ? tied.find((candidate) => candidate.category !== previousCategory)
    : null
  return (diverse || tied[0]).story
}

export async function selectAndRecordDailyNotification(env, stories, day) {
  const db = env?.EDITORIAL_DB
  if (!db) return { story: null, skipped: 'missing-d1-binding' }

  const existing = await db
    .prepare('SELECT story_id FROM notification_selections WHERE delivery_day = ? LIMIT 1')
    .bind(day)
    .first()
  if (existing?.story_id) {
    return {
      story: stories.find((story) => notificationStoryId(story) === existing.story_id) || null,
      reused: true,
    }
  }

  const previous = await db
    .prepare(
      `SELECT category FROM notification_selections
       WHERE delivery_day < ? ORDER BY delivery_day DESC LIMIT 1`,
    )
    .bind(day)
    .first()
  const story = selectDailyNotificationStory(stories, previous?.category || null)
  if (!story) return { story: null, skipped: 'no-story' }
  const storyId = notificationStoryId(story)
  const category = classifyAllowedEditorialTopic(story) || story.category || null
  const score = notificationImpactScore(story)
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO notification_selections (
        delivery_day, story_id, category, impact_score, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(day, storyId, category, score, new Date().toISOString())
    .run()
  // Minimització: el pany anti-spam només necessita una finestra curta i la
  // diversitat només mira enrere. No construïm un historial de dispositius.
  const claimsCutoff = new Date(Date.parse(`${day}T00:00:00.000Z`) - 8 * 86400000)
    .toISOString()
    .slice(0, 10)
  const selectionsCutoff = new Date(Date.parse(`${day}T00:00:00.000Z`) - 45 * 86400000)
    .toISOString()
    .slice(0, 10)
  await Promise.all([
    db.prepare('DELETE FROM notification_delivery_claims WHERE delivery_day < ?')
      .bind(claimsCutoff)
      .run(),
    db.prepare('DELETE FROM notification_selections WHERE delivery_day < ?')
      .bind(selectionsCutoff)
      .run(),
  ])
  if (Number(result.meta?.changes || 0) > 0) return { story, reused: false }

  const winner = await db
    .prepare('SELECT story_id FROM notification_selections WHERE delivery_day = ? LIMIT 1')
    .bind(day)
    .first()
  return {
    story: stories.find((candidate) => notificationStoryId(candidate) === winner?.story_id) || null,
    reused: true,
  }
}

async function recipientHash(recipient) {
  const bytes = new TextEncoder().encode(recipient)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function claimDailyNotification(env, { day, channel, recipient, storyId }) {
  const db = env?.EDITORIAL_DB
  if (!db) return { claimed: false, skipped: 'missing-d1-binding' }
  const hash = await recipientHash(recipient)
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO notification_delivery_claims (
        delivery_day, channel, recipient_hash, story_id, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(day, channel, hash, storyId, new Date().toISOString())
    .run()
  return { claimed: Number(result.meta?.changes || 0) > 0 }
}
