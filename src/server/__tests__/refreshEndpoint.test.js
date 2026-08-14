import { describe, expect, it } from 'vitest'
import worker from '../../worker.js'

// EL REFRESC MANUAL PASSA PER LA CUA.
//
// Executant-lo dins de la petició, un refresc manual podia coincidir amb el
// del cron i totes dues execucions es trepitjaven el lot públic. Ara s'encua,
// i la cua està serialitzada (max_concurrency: 1). Aquestes proves fixen el
// contracte: 202 —acceptat, encara no fet— i el missatge a la cua.

const TOKEN = 'testimoni-de-prova'

function envAmbCua() {
  const enviats = []
  return {
    enviats,
    BONDIARI_REFRESH_TOKEN: TOKEN,
    INGEST_QUEUE: {
      async send(message, options) {
        enviats.push({ message, options })
      },
    },
  }
}

function peticio(headers = {}) {
  return new Request('https://bondiari.com/api/refresh-news', {
    method: 'POST',
    headers,
  })
}

const ctx = { waitUntil() {}, passThroughOnException() {} }

describe('/api/refresh-news', () => {
  it('sense testimoni, no fa res', async () => {
    const env = envAmbCua()
    const res = await worker.fetch(peticio(), env, ctx)
    expect(res.status).toBe(401)
    expect(env.enviats).toHaveLength(0)
  })

  it('amb un testimoni equivocat, tampoc', async () => {
    const env = envAmbCua()
    const res = await worker.fetch(
      peticio({ authorization: 'Bearer aixo-no-es' }),
      env,
      ctx,
    )
    expect(res.status).toBe(401)
    expect(env.enviats).toHaveLength(0)
  })

  it('autenticat, respon 202 i encua la feina', async () => {
    const env = envAmbCua()
    const res = await worker.fetch(
      peticio({ authorization: `Bearer ${TOKEN}` }),
      env,
      ctx,
    )
    // 202 i no 200: acceptat, encara no fet. Amb 200, qui truca donaria el
    // refresc per acabat i llegiria el lot vell pensant que és nou.
    expect(res.status).toBe(202)
    const cos = await res.json()
    expect(cos.ok).toBe(true)
    expect(cos.queued).toBe(true)
    expect(cos.idempotencyKey).toEqual(expect.any(String))

    expect(env.enviats).toHaveLength(1)
    const { message, options } = env.enviats[0]
    expect(message.type).toBe('refresh-edition')
    expect(options.contentType).toBe('json')
    // El trigger manual no ha de repartir res: ni butlletí, ni push, ni xarxes.
    expect(message.distribution).toBe('none')
  })

  it('només accepta POST', async () => {
    const env = envAmbCua()
    const res = await worker.fetch(
      new Request('https://bondiari.com/api/refresh-news', {
        method: 'GET',
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
      env,
      ctx,
    )
    expect(res.status).toBe(405)
    expect(env.enviats).toHaveLength(0)
  })
})
