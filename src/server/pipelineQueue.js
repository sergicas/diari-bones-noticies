import { feedStoryId } from '../lib/story-id.js'
import { getLiveNewsPayload } from './liveNews.js'
import {
  backfillNewsletterSubscribers,
  sendDailyDigest,
} from './newsletter.js'
import { sendPushToAll } from './push.js'
import { sendApnsToAll } from './apns.js'
import { announceFreshStories } from './social.js'
import {
  beginPipelineJob,
  completePipelineJob,
  failPipelineJob,
  persistEditorialEdition,
  readEditionStories,
  recordDeliveryRun,
} from './editorialStore.js'

const MESSAGE_VERSION = 1

function isoFromScheduledTime(scheduledTime) {
  const date = new Date(Number(scheduledTime) || Date.now())
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function retryDelay(attempts) {
  return Math.min(300, 15 * 2 ** Math.max(0, Number(attempts || 1) - 1))
}

function log(level, event, data = {}) {
  const entry = JSON.stringify({ event, ...data })
  if (level === 'error') console.error(entry)
  else if (level === 'warn') console.warn(entry)
  else console.log(entry)
}

export function buildRefreshQueueMessage(event) {
  const requestedAt = isoFromScheduledTime(event?.scheduledTime)
  const distribution = event?.cron === '0 5 * * *' ? 'daily' : 'social'
  return {
    version: MESSAGE_VERSION,
    type: 'refresh-edition',
    idempotencyKey: `refresh:${event?.cron || 'manual'}:${requestedAt.slice(0, 16)}`,
    requestedAt,
    cron: event?.cron || null,
    slot: distribution === 'daily' ? 'morning' : 'evening',
    distribution,
  }
}

export function buildManualRefreshQueueMessage({
  distribution = 'none',
  idempotencyKey,
} = {}) {
  const requestedAt = new Date().toISOString()
  return {
    version: MESSAGE_VERSION,
    type: 'refresh-edition',
    idempotencyKey:
      idempotencyKey || `refresh:manual:${crypto.randomUUID()}`,
    requestedAt,
    cron: null,
    slot: 'manual',
    distribution,
  }
}

function isPipelineMessage(value) {
  return Boolean(
    value &&
      value.version === MESSAGE_VERSION &&
      typeof value.type === 'string' &&
      typeof value.idempotencyKey === 'string',
  )
}

async function latestStoriesFromKv(env) {
  const cached = await env.LIVE_NEWS_KV.get('latest', 'json')
  return Array.isArray(cached?.stories) ? cached.stories : []
}

async function queueDistribution(env, refreshMessage, edition) {
  if (refreshMessage.distribution === 'none') {
    return { skipped: 'distribution-disabled' }
  }
  if (!env.DISTRIBUTION_QUEUE) return { skipped: 'missing-queue-binding' }
  const message = {
    version: MESSAGE_VERSION,
    type: `${refreshMessage.distribution}-distribution`,
    idempotencyKey: `distribution:${refreshMessage.distribution}:${edition.editionId || refreshMessage.idempotencyKey}`,
    requestedAt: new Date().toISOString(),
    editionId: edition.editionId,
  }
  const sends = [
    env.DISTRIBUTION_QUEUE.send(message, { contentType: 'json' }),
  ]
  if (env.INGEST_QUEUE) {
    sends.push(
      env.INGEST_QUEUE.send(
        {
          version: MESSAGE_VERSION,
          type: 'backfill-newsletter',
          idempotencyKey: 'backfill:newsletter:v1',
          requestedAt: new Date().toISOString(),
        },
        { contentType: 'json' },
      ),
    )
  }
  await Promise.all(sends)
  return { queued: true, type: message.type }
}

async function processRefreshMessage(env, message) {
  const claim = await beginPipelineJob(env, message)
  if (!claim.shouldRun) return { skipped: 'already-completed' }
  try {
    const payload = await getLiveNewsPayload(env.LIVE_NEWS_KV, {
      force: true,
      env,
    })
    const edition = await persistEditorialEdition(env, payload, {
      slot: message.slot,
      trigger: 'queue',
    })
    const distribution = await queueDistribution(env, message, edition)
    const result = {
      editionId: edition.editionId,
      storyCount: edition.storyCount,
      distribution,
    }
    await completePipelineJob(env, message.idempotencyKey, result)
    return result
  } catch (error) {
    await failPipelineJob(env, message.idempotencyKey, error)
    throw error
  }
}

async function processDailyDistribution(env, message) {
  const claim = await beginPipelineJob(env, message)
  if (!claim.shouldRun) return { skipped: 'already-completed' }
  try {
    const storedStories = await readEditionStories(env, message.editionId, 6)
    const stories =
      storedStories.length > 0 ? storedStories : await latestStoriesFromKv(env)
    const digest = await sendDailyDigest(env)
    const top = stories[0]
    let push = { skipped: 'no-story' }
    let apns = { skipped: 'no-story' }
    if (top) {
      const notification = {
        title: 'La peça destacada del dia',
        body: top.title,
        url: `https://bondiari.com/noticia/${top.id || feedStoryId(top.url)}`,
      }
      push = await sendPushToAll(env, notification)
      apns = await sendApnsToAll(env, notification)
    }
    const result = { digest, push, apns }
    const sent =
      Number(digest.sent || 0) + Number(push.sent || 0) + Number(apns.sent || 0)
    const failed =
      Number(digest.failed || 0) +
      Number(push.failed || 0) +
      Number(apns.failed || 0)
    await recordDeliveryRun(env, {
      idempotencyKey: message.idempotencyKey,
      editionId: message.editionId,
      channel: 'daily',
      status: failed > 0 ? 'partial' : 'completed',
      sent,
      failed,
      result,
    })
    await completePipelineJob(env, message.idempotencyKey, result)
    return result
  } catch (error) {
    await failPipelineJob(env, message.idempotencyKey, error)
    throw error
  }
}

async function processNewsletterBackfill(env, message) {
  const claim = await beginPipelineJob(env, message)
  if (!claim.shouldRun) return { skipped: 'already-completed' }
  try {
    const result = await backfillNewsletterSubscribers(env)
    await completePipelineJob(env, message.idempotencyKey, result)
    return result
  } catch (error) {
    await failPipelineJob(env, message.idempotencyKey, error)
    throw error
  }
}

async function processSocialDistribution(env, message) {
  const claim = await beginPipelineJob(env, message)
  if (!claim.shouldRun) return { skipped: 'already-completed' }
  try {
    const storedStories = await readEditionStories(env, message.editionId, 30)
    const stories =
      storedStories.length > 0 ? storedStories : await latestStoriesFromKv(env)
    const result = await announceFreshStories(env, stories)
    await recordDeliveryRun(env, {
      idempotencyKey: message.idempotencyKey,
      editionId: message.editionId,
      channel: 'social',
      status: result.skipped ? 'skipped' : 'completed',
      sent: Number(result.published || 0),
      result,
    })
    await completePipelineJob(env, message.idempotencyKey, result)
    return result
  } catch (error) {
    await failPipelineJob(env, message.idempotencyKey, error)
    throw error
  }
}

export async function processPipelineMessage(env, message) {
  if (!isPipelineMessage(message)) {
    throw new Error('invalid-pipeline-message')
  }
  if (message.type === 'refresh-edition') {
    return processRefreshMessage(env, message)
  }
  if (message.type === 'daily-distribution') {
    return processDailyDistribution(env, message)
  }
  if (message.type === 'social-distribution') {
    return processSocialDistribution(env, message)
  }
  if (message.type === 'backfill-newsletter') {
    return processNewsletterBackfill(env, message)
  }
  throw new Error(`unsupported-pipeline-message:${message.type}`)
}

export async function handlePipelineBatch(batch, env) {
  for (const message of batch.messages) {
    try {
      const result = await processPipelineMessage(env, message.body)
      message.ack()
      log('info', 'pipeline.message.completed', {
        queue: batch.queue,
        messageId: message.id,
        type: message.body?.type,
        result,
      })
    } catch (error) {
      message.retry({ delaySeconds: retryDelay(message.attempts) })
      log('error', 'pipeline.message.failed', {
        queue: batch.queue,
        messageId: message.id,
        type: message.body?.type,
        attempts: message.attempts,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
