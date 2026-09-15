import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MAX_INTENTS, buildRefreshQueueMessage } from '../pipelineQueue.js'
import { refreshIntervalMs } from '../rss/feedsConfig.js'

// MAX_INTENTS I max_retries HAN D'ANAR A L'UNA.
//
// `MAX_INTENTS` decideix quan una feina es dona per morta; `max_retries`
// decideix quantes vegades la cua la torna a repartir. Si es desincronitzen,
// passa una de dues coses, totes dues dolentes en silenci: marcar 'failed'
// quan encara quedaven intents (l'error que va costar una revisió sencera), o
// no marcar-la mai i deixar-la eternament en 'processing'.
//
// Tres reintents volen dir que el quart lliurament és l'últim: MAX_INTENTS =
// max_retries + 1.

function llegeixWrangler() {
  const cru = readFileSync(new URL('../../../wrangler.jsonc', import.meta.url), 'utf8')
  // Es treuen només les línies que SÓN un comentari: així no es toca cap
  // "https://" que hi hagi dins d'un valor.
  const net = cru
    .split('\n')
    .filter((linia) => !linia.trim().startsWith('//'))
    .join('\n')
  return JSON.parse(net)
}

const config = llegeixWrangler()

function consumidor(nom) {
  const deProduccio = config.queues?.consumers || []
  const dEntorns = Object.values(config.env || {}).flatMap(
    (entorn) => entorn.queues?.consumers || [],
  )
  return [...deProduccio, ...dEntorns].find((c) => c.queue === nom) || null
}

// TOTES les cues passen pel mateix `handlePipelineBatch`, i per tant totes
// obeeixen `MAX_INTENTS`. Si una tingués un `max_retries` diferent, les seves
// feines es marcarien malament sense que res ho digués.
const AMB_REINTENTS = [
  'bondiari-ingest',
  'bondiari-ingest-staging',
  'bondiari-distribute',
  'bondiari-distribute-staging',
]

// El consumidor únic només cal a la ingesta: és qui escriu el lot públic. La
// distribució (butlletí, push, xarxes) no el toca i pot anar en paral·lel.
const AMB_CONSUMIDOR_UNIC = ['bondiari-ingest', 'bondiari-ingest-staging']

const CRONS_DE_REFRESC = [
  '0 5,13,21 * * *',
  '15 5,13,21 * * *',
]

describe('la configuració de les cues i el codi diuen el mateix', () => {
  it('programa tres edicions separades 8 h i un reintent per a cadascuna', () => {
    expect(config.triggers?.crons).toEqual(CRONS_DE_REFRESC)
    expect(config.env?.staging?.triggers?.crons).toEqual([])
    expect(refreshIntervalMs).toBe(8 * 60 * 60 * 1000)
    const [principal, reintent] = config.triggers.crons
    const hores = principal.split(' ')[1].split(',').map(Number)
    const claus = new Set()
    for (const [index, hora] of hores.entries()) {
      expect(((hores[(index + 1) % hores.length] - hora + 24) % 24) * 3600000)
        .toBe(refreshIntervalMs)
      const scheduledTime = Date.UTC(2026, 8, 15, hora)
      const message = buildRefreshQueueMessage({ cron: principal, scheduledTime })
      const retry = buildRefreshQueueMessage({
        cron: reintent,
        scheduledTime: scheduledTime + 15 * 60 * 1000,
      })
      expect(retry.idempotencyKey).toBe(message.idempotencyKey)
      expect(message.distribution).toBe(['daily', 'none', 'social'][index])
      expect(message.slot).toBe(['morning', 'afternoon', 'evening'][index])
      claus.add(message.idempotencyKey)
    }
    expect(claus.size).toBe(3)
    const seguentDia = buildRefreshQueueMessage({
      cron: principal,
      scheduledTime: Date.UTC(2026, 8, 16, 5),
    })
    expect(claus.has(seguentDia.idempotencyKey)).toBe(false)
  })

  for (const cua of AMB_REINTENTS) {
    it(`${cua}: MAX_INTENTS = max_retries + 1`, () => {
      const c = consumidor(cua)
      expect(c, `no s'ha trobat el consumidor ${cua}`).not.toBeNull()
      expect(MAX_INTENTS).toBe(Number(c.max_retries) + 1)
    })
  }

  for (const cua of AMB_CONSUMIDOR_UNIC) {
    it(`${cua}: un sol consumidor alhora`, () => {
      // Sense això, dues execucions del radar es trepitgen el lot públic. Les
      // configuracions d'entorn de Wrangler no s'hereten: cal a totes dues.
      expect(consumidor(cua)?.max_concurrency).toBe(1)
    })
  }
})
