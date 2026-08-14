import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MAX_INTENTS } from '../pipelineQueue.js'

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

describe('la configuració de la cua i el codi diuen el mateix', () => {
  for (const cua of ['bondiari-ingest', 'bondiari-ingest-staging']) {
    it(`${cua}: MAX_INTENTS = max_retries + 1`, () => {
      const c = consumidor(cua)
      expect(c, `no s'ha trobat el consumidor ${cua}`).not.toBeNull()
      expect(MAX_INTENTS).toBe(Number(c.max_retries) + 1)
    })

    it(`${cua}: un sol consumidor alhora`, () => {
      // Sense això, dues execucions del radar es trepitgen el lot públic. Les
      // configuracions d'entorn de Wrangler no s'hereten: cal a totes dues.
      expect(consumidor(cua)?.max_concurrency).toBe(1)
    })
  }
})
