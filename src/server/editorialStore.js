import { feedStoryId } from '../lib/story-id.js'
import { keepArchiveStory } from '../lib/category.js'
import { editorialSeedStories } from '../data/articles.js'
import { selectPublishableStories } from './editorialQuality.js'

const MAX_STATEMENTS_PER_BATCH = 40
const MAX_ARCHIVE_STORIES = 2000
const STORY_KEY_PREFIX = 'story:'
const STORY_DETAIL_TTL_SECONDS = 30 * 24 * 60 * 60
const ACTIVE_STORY_AGE_MS = 5 * 24 * 60 * 60 * 1000

function nowIso() {
  return new Date().toISOString()
}

function safeJson(value) {
  return JSON.stringify(value ?? null)
}

function chunks(items, size = MAX_STATEMENTS_PER_BATCH) {
  const result = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

function storyId(story) {
  return story?.id || feedStoryId(story?.url || story?.title || '')
}

function database(env) {
  return env?.EDITORIAL_DB || null
}

function parseStoredStory(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function selectPublicStories(stories, { onReject } = {}) {
  // El catàleg durable no descarta FITS-NONE: no entren a la línia temàtica
  // nova, però es mantenen a l'hemeroteca i continuen resolent la seva URL.
  const topicSafe = (stories || []).map(keepArchiveStory)

  const qualitySafe = selectPublishableStories(topicSafe, {
    onReject: (story, result) => onReject?.(story, 'quality', result),
  })
  const byId = new Map()
  for (const story of qualitySafe) {
    const id = storyId(story)
    if (!id) continue
    byId.set(id, { ...story, id })
  }
  return [...byId.values()].sort(
    (left, right) =>
      new Date(right.publishedAt || 0).getTime() -
      new Date(left.publishedAt || 0).getTime(),
  )
}

function editorialSeeds() {
  return selectPublicStories(editorialSeedStories)
}

function monthBounds(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function readEditorialStoryCatalog(env, { limit = 1000 } = {}) {
  const db = database(env)
  const safeLimit = Math.max(1, Math.min(MAX_ARCHIVE_STORIES, Number(limit) || 1000))
  // Les peces llavor aprovades formen part del catàleg encara que el binding
  // D1 no estigui disponible en una previsualització. No les escrivim a D1
  // aquí: la lectura és determinista i no té efectes laterals.
  if (!db) {
    const stories = editorialSeeds().slice(0, safeLimit)
    return { available: false, stories, count: stories.length, updatedAt: null }
  }
  const result = await db
    .prepare(
      `SELECT payload_json, updated_at
      FROM stories
      WHERE editorial_status IN ('published', 'distributed', 'archived')
      ORDER BY COALESCE(published_at, first_seen_at) DESC
      LIMIT ?`,
    )
    .bind(safeLimit)
    .all()
  const rows = result.results || []
  const stories = selectPublicStories(
    [
      ...rows.map((row) => parseStoredStory(row.payload_json)).filter(Boolean),
      ...editorialSeedStories,
    ],
  ).slice(0, safeLimit)
  const updatedAt = rows.reduce(
    (latest, row) => (!latest || row.updated_at > latest ? row.updated_at : latest),
    null,
  )
  return { available: true, stories, count: stories.length, updatedAt }
}

export async function readUniqueEditorialStats(env, date = new Date()) {
  const db = database(env)
  if (!db) return { available: false, publishedUnique: 0, trackingSince: null }
  const { start, end } = monthBounds(date)
  const result = await db
    .prepare(
      `SELECT payload_json, first_seen_at
      FROM stories
      WHERE editorial_status IN ('published', 'distributed', 'archived')
        AND first_seen_at >= ? AND first_seen_at < ?
      ORDER BY first_seen_at ASC
      LIMIT ?`,
    )
    .bind(start, end, MAX_ARCHIVE_STORIES)
    .all()
  const candidates = (result.results || [])
    .map((row) => {
      const story = parseStoredStory(row.payload_json)
      return story ? { ...story, firstSeenAt: row.first_seen_at } : null
    })
    .filter(Boolean)
  const stories = selectPublicStories(candidates)
  const trackingSince = stories.reduce(
    (earliest, story) =>
      !earliest || story.firstSeenAt < earliest ? story.firstSeenAt : earliest,
    null,
  )
  return {
    available: true,
    publishedUnique: stories.length,
    trackingSince,
  }
}

async function listStoredStoryKeys(kv) {
  const keys = []
  let cursor
  do {
    const page = await kv.list({
      prefix: STORY_KEY_PREFIX,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    })
    keys.push(...(page.keys || []))
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return keys
}

function bulkValue(values, key) {
  if (values instanceof Map) return values.get(key)
  return values?.[key]
}

export async function backfillEditorialArchive(env) {
  const db = database(env)
  const kv = env?.LIVE_NEWS_KV
  if (!db || !kv) {
    return {
      available: false,
      skipped: !db ? 'missing-d1-binding' : 'missing-kv-binding',
    }
  }

  const keys = await listStoredStoryKeys(kv)
  const candidates = []
  let invalid = 0
  for (const keyBatch of chunks(keys, 100)) {
    const names = keyBatch.map((key) => key.name)
    const values = await kv.get(names, 'json')
    for (const key of keyBatch) {
      const rawStory = parseStoredStory(bulkValue(values, key.name))
      if (!rawStory?.title) {
        invalid += 1
        continue
      }
      const id = rawStory.id || key.name.slice(STORY_KEY_PREFIX.length)
      const inferredFirstSeenAt = key.expiration
        ? new Date((key.expiration - STORY_DETAIL_TTL_SECONDS) * 1000).toISOString()
        : rawStory.publishedAt || nowIso()
      candidates.push({
        ...rawStory,
        id,
        firstSeenAt: rawStory.firstSeenAt || inferredFirstSeenAt,
      })
    }
  }

  let outsideTopic = 0
  let qualityRejected = 0
  const stories = selectPublicStories(candidates, {
    onReject: (_story, reason) => {
      if (reason === 'quality') qualityRejected += 1
    },
  })
  const timestamp = nowIso()
  const activeCutoff = Date.now() - ACTIVE_STORY_AGE_MS
  let recent = 0
  let archived = 0
  const statements = stories.map((story) => {
    const publishedTime = new Date(story.publishedAt || 0).getTime()
    const status = publishedTime >= activeCutoff ? 'published' : 'archived'
    if (status === 'published') recent += 1
    else archived += 1
    return db
      .prepare(
        `INSERT INTO stories (
          id, url, title, source, section, language, editorial_status,
          published_at, payload_json, first_seen_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          url = excluded.url,
          title = excluded.title,
          source = excluded.source,
          section = excluded.section,
          language = excluded.language,
          editorial_status = CASE
            WHEN stories.editorial_status = 'rejected' THEN 'rejected'
            ELSE excluded.editorial_status
          END,
          published_at = excluded.published_at,
          payload_json = excluded.payload_json,
          first_seen_at = MIN(stories.first_seen_at, excluded.first_seen_at),
          updated_at = excluded.updated_at`,
      )
      .bind(
        story.id,
        story.url || `https://bondiari.com/noticia/${story.id}`,
        story.title,
        story.source || null,
        story.category || story.section || null,
        story.language || 'ca',
        status,
        story.publishedAt || story.firstSeenAt || timestamp,
        safeJson(story),
        story.firstSeenAt || timestamp,
        timestamp,
      )
  })

  for (const batch of chunks(statements)) {
    await db.batch(batch)
  }

  return {
    available: true,
    scanned: keys.length,
    accepted: stories.length,
    imported: statements.length,
    recent,
    archived,
    outsideTopic,
    qualityRejected,
    invalid,
  }
}

export function editionIdFor(payload, slot = 'manual') {
  const updatedAt = payload?.updatedAt || nowIso()
  return `edition:${updatedAt}:${slot}`
}

export async function persistEditorialEdition(
  env,
  payload,
  { slot = 'manual', trigger = 'manual' } = {},
) {
  const db = database(env)
  if (!db) return { skipped: 'missing-d1-binding', editionId: null, storyCount: 0 }

  const stories = Array.isArray(payload?.stories) ? payload.stories : []
  const timestamp = payload?.updatedAt || nowIso()
  const editionId = editionIdFor(payload, slot)
  const metadata = {
    cache: payload?.cache || null,
    freshCount: Number(payload?.freshCount || 0),
    totalCandidates: Number(payload?.totalCandidates || 0),
    reviewedThisPass: Number(payload?.reviewedThisPass || 0),
    cronDurationMs: Number(payload?.cronDurationMs || 0),
  }

  await db
    .prepare(
      `INSERT INTO editions (
        id, edition_date, slot, trigger_type, status, story_count,
        metadata_json, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'published', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = 'published',
        story_count = excluded.story_count,
        metadata_json = excluded.metadata_json,
        published_at = excluded.published_at,
        updated_at = excluded.updated_at`,
    )
    .bind(
      editionId,
      timestamp.slice(0, 10),
      slot,
      trigger,
      stories.length,
      safeJson(metadata),
      timestamp,
      timestamp,
      timestamp,
    )
    .run()

  const statements = []
  stories.forEach((story, position) => {
    const id = storyId(story)
    const firstSeenAt = story?.firstSeenAt || timestamp
    statements.push(
      db
        .prepare(
          `INSERT INTO stories (
            id, url, title, source, section, language, editorial_status,
            published_at, payload_json, first_seen_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            url = excluded.url,
            title = excluded.title,
            source = excluded.source,
            section = excluded.section,
            language = excluded.language,
            editorial_status = 'published',
            published_at = excluded.published_at,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at`,
        )
        .bind(
          id,
          story?.url || `https://bondiari.com/noticia/${id}`,
          story?.title || 'Sense títol',
          story?.source || null,
          story?.category || story?.section || null,
          story?.language || 'ca',
          story?.publishedAt || timestamp,
          safeJson({ ...story, id }),
          firstSeenAt,
          timestamp,
        ),
    )
    statements.push(
      db
        .prepare(
          `INSERT INTO edition_stories (edition_id, story_id, position)
          VALUES (?, ?, ?)
          ON CONFLICT(edition_id, story_id) DO UPDATE SET
            position = excluded.position`,
        )
        .bind(editionId, id, position),
    )
  })

  for (const batch of chunks(statements)) {
    await db.batch(batch)
  }

  return { editionId, storyCount: stories.length }
}

export async function findStoryInEditorialStore(env, id) {
  const db = database(env)
  if (!id) return null
  if (db) {
    const row = await db
      .prepare(
        // LLISTA BLANCA, NO NEGRA (14-08-2026).
        //
        // Abans deia `editorial_status != 'rejected'`, i això deixava passar
        // les peces en estat `captured`: qualsevol esborrany pendent de
        // revisió era llegible per /noticia/:id abans que ningú l'aprovés.
        // La porta d'aprovació tenia, doncs, una escletxa pública.
        //
        // Amb una llista blanca, un estat nou neix INVISIBLE i cal decidir
        // expressament de publicar-lo. Amb una llista negra passava el
        // contrari, que és el costat perillós.
        `SELECT payload_json
        FROM stories
        WHERE id = ? AND editorial_status IN ('published', 'distributed', 'archived')
        LIMIT 1`,
      )
      .bind(id)
      .first()
    if (row?.payload_json) {
      try {
        return JSON.parse(row.payload_json)
      } catch {
        // Si la fila persistent és invàlida, encara podem resoldre una llavor.
      }
    }
  }
  return editorialSeedStories.find((story) => story.id === id) || null
}

export async function readEditionStories(env, editionId, limit = 30) {
  const db = database(env)
  if (!db || !editionId) return []
  const result = await db
    .prepare(
      `SELECT stories.payload_json
      FROM edition_stories
      INNER JOIN stories ON stories.id = edition_stories.story_id
      WHERE edition_stories.edition_id = ?
      ORDER BY edition_stories.position ASC
      LIMIT ?`,
    )
    .bind(editionId, Math.max(1, Math.min(100, Number(limit) || 30)))
    .all()
  return (result.results || [])
    .map((row) => {
      try {
        return JSON.parse(row.payload_json)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

export async function beginPipelineJob(env, message) {
  const db = database(env)
  if (!db) return { shouldRun: true, persisted: false }
  const timestamp = nowIso()
  const result = await db
    .prepare(
      `INSERT INTO pipeline_jobs (
        id, idempotency_key, job_type, status, attempts, payload_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'processing', 1, ?, ?, ?)
      ON CONFLICT(idempotency_key) DO UPDATE SET
        status = 'processing',
        attempts = pipeline_jobs.attempts + 1,
        payload_json = excluded.payload_json,
        last_error = NULL,
        updated_at = excluded.updated_at
      WHERE pipeline_jobs.status != 'completed'`,
    )
    .bind(
      crypto.randomUUID(),
      message.idempotencyKey,
      message.type,
      safeJson(message),
      timestamp,
      timestamp,
    )
    .run()
  return { shouldRun: Number(result.meta?.changes || 0) > 0, persisted: true }
}

export async function completePipelineJob(env, idempotencyKey, result) {
  const db = database(env)
  if (!db) return
  const timestamp = nowIso()
  await db
    .prepare(
      `UPDATE pipeline_jobs
      SET status = 'completed', result_json = ?, last_error = NULL,
          updated_at = ?, completed_at = ?
      WHERE idempotency_key = ?`,
    )
    .bind(safeJson(result), timestamp, timestamp, idempotencyKey)
    .run()
}

export async function failPipelineJob(env, idempotencyKey, error) {
  const db = database(env)
  if (!db) return
  await db
    .prepare(
      `UPDATE pipeline_jobs
      SET status = 'failed', last_error = ?, updated_at = ?
      WHERE idempotency_key = ?`,
    )
    .bind(
      error instanceof Error ? error.message : String(error),
      nowIso(),
      idempotencyKey,
    )
    .run()
}

/**
 * L'estat d'una feina concreta de la cua.
 *
 * Sense això, qui demanava un refresc només podia mirar si la data del lot
 * canviava, i això és un senyal indirecte que enganya de dues maneres: una
 * feina ALIENA que acabi abans fa creure que ha acabat la teva, i una feina
 * PRÒPIA que acabi sense canviar el lot (perquè no hi havia res nou) fa creure
 * que no ha acabat. Amb la clau d'idempotència es pregunta per la feina que
 * s'ha encuat i per cap altra.
 */
export async function readPipelineJob(env, idempotencyKey) {
  const db = database(env)
  if (!db || !idempotencyKey) return null
  const row = await db
    .prepare(
      `SELECT idempotency_key, job_type, status, attempts, result_json,
              last_error, created_at, updated_at, completed_at
         FROM pipeline_jobs WHERE idempotency_key = ? LIMIT 1`,
    )
    .bind(idempotencyKey)
    .first()
  if (!row) return null
  let result = null
  try {
    result = row.result_json ? JSON.parse(row.result_json) : null
  } catch {
    result = null
  }
  return {
    idempotencyKey: row.idempotency_key,
    type: row.job_type,
    status: row.status,
    attempts: Number(row.attempts || 0),
    result,
    error: row.last_error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || null,
  }
}

export async function recordDeliveryRun(
  env,
  { idempotencyKey, editionId = null, channel, status, sent = 0, failed = 0, result },
) {
  const db = database(env)
  if (!db) return
  const timestamp = nowIso()
  await db
    .prepare(
      `INSERT INTO delivery_runs (
        id, idempotency_key, edition_id, channel, status, sent_count,
        failed_count, result_json, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(idempotency_key) DO UPDATE SET
        status = excluded.status,
        sent_count = excluded.sent_count,
        failed_count = excluded.failed_count,
        result_json = excluded.result_json,
        completed_at = excluded.completed_at`,
    )
    .bind(
      crypto.randomUUID(),
      idempotencyKey,
      editionId,
      channel,
      status,
      Number(sent || 0),
      Number(failed || 0),
      safeJson(result),
      timestamp,
      timestamp,
    )
    .run()
}

export async function mirrorNewsletterSubscriber(env, id, record) {
  const db = database(env)
  if (!db || !id || !record?.email) return { skipped: true }
  const timestamp = nowIso()
  await db
    .prepare(
      `INSERT INTO newsletter_subscribers (
        id, email, language, status, action_token, source, subscribed_at,
        last_pending_at, confirmed_at, unsubscribed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        language = excluded.language,
        status = excluded.status,
        action_token = excluded.action_token,
        source = excluded.source,
        subscribed_at = excluded.subscribed_at,
        last_pending_at = excluded.last_pending_at,
        confirmed_at = excluded.confirmed_at,
        unsubscribed_at = NULL,
        updated_at = excluded.updated_at`,
    )
    .bind(
      id,
      record.email,
      record.language || 'ca',
      record.status || 'confirmed',
      record.actionToken || null,
      record.source || 'legacy',
      record.subscribedAt || timestamp,
      record.lastPendingAt || null,
      record.confirmedAt || null,
      timestamp,
    )
    .run()
  return { mirrored: true }
}

export async function deleteNewsletterSubscriberMirror(env, id) {
  const db = database(env)
  if (!db || !id) return
  await db
    .prepare('DELETE FROM newsletter_subscribers WHERE id = ?')
    .bind(id)
    .run()
}

export async function readPipelineHealth(env) {
  const db = database(env)
  if (!db) return { available: false }
  const [
    stories,
    editions,
    jobs,
    deliveries,
    subscribers,
    latestEdition,
    recentJobs,
    recentDeliveries,
  ] =
    await Promise.all([
      db.prepare('SELECT COUNT(*) AS total FROM stories').first(),
      db.prepare('SELECT COUNT(*) AS total FROM editions').first(),
      db
        .prepare(
          `SELECT
            SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
            SUM(
              CASE
                WHEN status = 'processing'
                  AND updated_at < datetime('now', '-15 minutes')
                THEN 1 ELSE 0
              END
            ) AS stale_processing,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
          FROM pipeline_jobs`,
        )
        .first(),
      db.prepare('SELECT COUNT(*) AS total FROM delivery_runs').first(),
      db
        .prepare(
          `SELECT
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
          FROM newsletter_subscribers`,
        )
        .first(),
      db
        .prepare(
          `SELECT id, edition_date, slot, status, story_count, published_at
          FROM editions
          ORDER BY published_at DESC
          LIMIT 1`,
        )
        .first(),
      db
        .prepare(
          `SELECT
            idempotency_key, job_type, status, attempts, last_error,
            created_at, updated_at, completed_at
          FROM pipeline_jobs
          ORDER BY updated_at DESC
          LIMIT 10`,
        )
        .all(),
      db
        .prepare(
          `SELECT
            idempotency_key, edition_id, channel, status, sent_count,
            failed_count, created_at, completed_at
          FROM delivery_runs
          ORDER BY completed_at DESC
          LIMIT 10`,
        )
        .all(),
    ])
  return {
    available: true,
    stories: Number(stories?.total || 0),
    editions: Number(editions?.total || 0),
    jobs: {
      processing: Number(jobs?.processing || 0),
      staleProcessing: Number(jobs?.stale_processing || 0),
      failed: Number(jobs?.failed || 0),
      completed: Number(jobs?.completed || 0),
    },
    deliveries: Number(deliveries?.total || 0),
    subscribers: {
      confirmed: Number(subscribers?.confirmed || 0),
      pending: Number(subscribers?.pending || 0),
    },
    latestEdition: latestEdition || null,
    recentJobs: recentJobs.results || [],
    recentDeliveries: recentDeliveries.results || [],
  }
}
