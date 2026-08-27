import { feedStoryId } from '../lib/story-id.js'
import { getLiveNewsPayload } from './liveNews.js'
import {
  backfillNewsletterSubscribers,
  sendDailyDigest,
  sendReviewReminder,
} from './newsletter.js'
import { expireStaleCandidates, senseVetades } from './reviewGate.js'
import { sendPushToAll } from './push.js'
import { sendApnsToAll } from './apns.js'
import { announceFreshStories } from './social.js'
import {
  notificationStoryId,
  selectAndRecordDailyNotification,
} from './dailyNotification.js'
import {
  beginPipelineJob,
  completePipelineJob,
  failPipelineJob,
  persistEditorialEdition,
  readEditionForDistribution,
  recordDeliveryRun,
} from './editorialStore.js'

const MESSAGE_VERSION = 1

// Intents totals abans de donar una feina per perduda: el primer lliurament
// més els `max_retries` de la cua. HA D'ANAR A L'UNA amb wrangler.jsonc
// (`max_retries: 3` als consumidors bondiari-ingest i bondiari-ingest-staging).
// Si allà es canvia, aquí també.
export const MAX_INTENTS = 4

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

export function dailyEditionNeedsRetry(message, payload) {
  return (
    message?.distribution === 'daily' &&
    Number(payload?.publishedCount || 0) < 1
  )
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
  const stories = Array.isArray(cached?.stories) ? cached.stories : []
  // KV va endarrerit: el lot públic encara pot contenir una peça que algú
  // acaba de retirar. Distribuir és irreversible —un correu enviat no torna—,
  // així que abans de sortir es consulta el veto a la sala. Si la sala no
  // respon, `senseVetades` llança i la cua ho reintenta: val més el butlletí
  // tard que amb una peça retirada.
  return senseVetades(env, stories)
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
  const payload = await getLiveNewsPayload(env.LIVE_NEWS_KV, {
    force: true,
    env,
  })
  // 'transient' vol dir que el lot públic NO s'ha pogut desar: getLiveNewsPayload
  // s'empassa l'error d'escriptura i torna les peces perquè el radar no s'aturi
  // del tot. Però per a la cua això és una fallada, no un èxit: donant-la per
  // bona, es completava la feina i el missatge s'acabava confirmant, de manera
  // que una avaria transitòria —justament la que es reintenta bé— no es
  // reintentava mai. Es llança ABANS de persistir res i de completar.
  if (payload.cache === 'transient') {
    throw new Error('no s’ha pogut desar el lot públic (transient)')
  }
  // El cron del matí no es pot donar per bo amb una edició reciclada. Cada
  // reintent avança el pool perquè les candidates processades ja han quedat
  // memoritzades; així la cua prova el següent grup fins que publica almenys
  // una notícia nova o deixa una fallada visible després de tots els intents.
  if (dailyEditionNeedsRetry(message, payload)) {
    throw new Error('l’edició diària no ha publicat cap notícia nova')
  }
  const edition = await persistEditorialEdition(env, payload, {
    slot: message.slot,
    trigger: 'queue',
  })
  const distribution = await queueDistribution(env, message, edition)
  // El resultat ha de dir prou perquè qui esperi la feina sàpiga què ha
  // passat sense haver d'endevinar-ho mirant el lot: si el radar va sortir
  // per una porta d'avaria (`cache`), quina data té l'edició i quantes peces
  // hi ha. Amb `cache: 'stale'` la data pot no haver canviat, i això és
  // correcte, no un senyal que la feina no s'hagi fet.
  const result = {
    editionId: edition.editionId,
    storyCount: edition.storyCount,
    cache: payload.cache || null,
    updatedAt: payload.updatedAt || null,
    publishedCount: Number(payload.publishedCount || 0),
    distribution,
  }
  await completePipelineJob(env, message.idempotencyKey, result)
  return result
}

async function processDailyDistribution(env, message) {
  const claim = await beginPipelineJob(env, message)
  if (!claim.shouldRun) return { skipped: 'already-completed' }
  const edicio = await readEditionForDistribution(env, message.editionId, 6)
  // Si l'edició existeix, mana el que hi ha: encara que hagi quedat a zero
  // perquè se n'han retirat les peces. Caure a `latest` en aquest cas enviava
  // notícies d'una altra edició.
  const stories = edicio.edicioTrobada
    ? edicio.stories
    : await latestStoriesFromKv(env)
  if (stories.length === 0) {
    const buida = { skipped: 'no-stories', edicioTrobada: edicio.edicioTrobada }
    await completePipelineJob(env, message.idempotencyKey, buida)
    return buida
  }
  // Les mateixes peces que ja s'han comprovat contra la sala, no una lectura
  // nova de `latest`: si no, el correu i la notificació podien anar per camins
  // diferents i enviar coses distintes.
  const digest = await sendDailyDigest(env, { stories })
  const deliveryDay = String(message.requestedAt || new Date().toISOString()).slice(0, 10)
  const selection = await selectAndRecordDailyNotification(env, stories, deliveryDay)
  const top = selection.story
  let push = { skipped: 'no-story' }
  let apns = { skipped: 'no-story' }
  if (top) {
    const notification = {
      title: 'La peça destacada del dia',
      body: top.title,
      url: `https://bondiari.com/noticia/${top.id || feedStoryId(top.url)}`,
    }
    const delivery = { day: deliveryDay, storyId: notificationStoryId(top) }
    // El web i APNs comparteixen la mateixa peça, però cada canal té un pany
    // diari propi per dispositiu. Això permet activar Apple després del web
    // sense duplicar avisos dins d'un mateix canal.
    push = await sendPushToAll(env, notification, delivery)
    apns = await sendApnsToAll(env, notification, delivery)
  }
  // Les peces que ningú no ha llegit en set dies marxen soles, i després
  // s'avisa de les que queden. Aquest ordre importa: així el correu no compta
  // peces que ja han caducat. Cap dels dos passos no ha de tombar el
  // repartiment del matí si falla.
  let review = { skipped: 'not-run' }
  try {
    await expireStaleCandidates(env)
    review = await sendReviewReminder(env)
  } catch (error) {
    log('warn', 'review.reminder.failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    review = { skipped: 'failed' }
  }

  const result = {
    digest,
    push,
    apns,
    review,
    notificationStoryId: top ? notificationStoryId(top) : null,
  }
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
}

async function processNewsletterBackfill(env, message) {
  const claim = await beginPipelineJob(env, message)
  if (!claim.shouldRun) return { skipped: 'already-completed' }
  const result = await backfillNewsletterSubscribers(env)
  await completePipelineJob(env, message.idempotencyKey, result)
  return result
}

async function processSocialDistribution(env, message) {
  const claim = await beginPipelineJob(env, message)
  if (!claim.shouldRun) return { skipped: 'already-completed' }
  const edicio = await readEditionForDistribution(env, message.editionId, 30)
  // Si l'edició existeix, mana el que hi ha: encara que hagi quedat a zero
  // perquè se n'han retirat les peces. Caure a `latest` en aquest cas enviava
  // notícies d'una altra edició.
  const stories = edicio.edicioTrobada
    ? edicio.stories
    : await latestStoriesFromKv(env)
  if (stories.length === 0) {
    const buida = { skipped: 'no-stories', edicioTrobada: edicio.edicioTrobada }
    await completePipelineJob(env, message.idempotencyKey, buida)
    return buida
  }
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
      // AQUÍ es decideix si la feina ha fallat DE DEBÒ.
      //
      // Cloudflare Queues reparteix com a mínim una vegada i reintenta fins a
      // `max_retries`. Marcar 'failed' al primer error feia que els scripts
      // abandonessin mentre la cua encara havia de tornar a executar la feina:
      // l'estat mentia. Aquest és l'únic nivell que sap quants intents porta.
      const attempts = Number(message.attempts || 1)
      const terminal = attempts >= MAX_INTENTS
      await failPipelineJob(env, message.body?.idempotencyKey, error, {
        terminal,
        attempts,
      })
      message.retry({ delaySeconds: retryDelay(attempts) })
      log(terminal ? 'error' : 'warn', 'pipeline.message.failed', {
        queue: batch.queue,
        messageId: message.id,
        type: message.body?.type,
        attempts,
        terminal,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
