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

  it('el 202 diu on consultar AQUESTA feina', async () => {
    const env = envAmbCua()
    const res = await worker.fetch(
      peticio({ authorization: `Bearer ${TOKEN}` }),
      env,
      ctx,
    )
    const cos = await res.json()
    expect(cos.statusUrl).toContain('/api/pipeline-job?key=')
    expect(cos.statusUrl).toContain(encodeURIComponent(cos.idempotencyKey))
    expect(res.headers.get('location')).toBe(cos.statusUrl)
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

// ---------------------------------------------------------------------------

function envAmbFeines(feines) {
  return {
    BONDIARI_REFRESH_TOKEN: TOKEN,
    EDITORIAL_DB: {
      prepare() {
        return {
          clau: null,
          bind(clau) {
            this.clau = clau
            return this
          },
          async first() {
            return feines[this.clau] || null
          },
        }
      },
    },
  }
}

function estat(clau, token = TOKEN) {
  return new Request(
    `https://bondiari.com/api/pipeline-job?key=${encodeURIComponent(clau)}`,
    { headers: token ? { authorization: `Bearer ${token}` } : {} },
  )
}

function fila({ clau, status, result = null, error = null }) {
  return {
    idempotency_key: clau,
    job_type: 'refresh-edition',
    status,
    attempts: 1,
    result_json: result ? JSON.stringify(result) : null,
    last_error: error,
    created_at: '2026-08-14T06:00:00.000Z',
    updated_at: '2026-08-14T06:01:00.000Z',
    completed_at: status === 'completed' ? '2026-08-14T06:01:00.000Z' : null,
  }
}

describe('/api/pipeline-job: sondejar LA feina, no la data del lot', () => {
  it('una feina ALIENA acabada no fa creure que ha acabat la teva', async () => {
    // El cas que enganyava abans: hi havia una altra feina a la cua, acabava
    // primer i canviava la data del lot. Sondejant la data, l'script donava per
    // bona una feina que encara esperava.
    const env = envAmbFeines({
      'refresh:aliena': fila({ clau: 'refresh:aliena', status: 'completed' }),
      'refresh:meva': fila({ clau: 'refresh:meva', status: 'processing' }),
    })
    const res = await worker.fetch(estat('refresh:meva'), env, ctx)
    const feina = await res.json()
    expect(feina.status).toBe('processing')
    expect(feina.idempotencyKey).toBe('refresh:meva')
  })

  it('una feina PRÒPIA acabada sense canviar la data consta com a acabada', async () => {
    // L'altra cara del mateix engany: la feina va bé, però el radar surt per
    // una porta d'avaria i conserva la data a propòsit. Sondejant la data,
    // l'script deia per sempre que no havia acabat.
    const env = envAmbFeines({
      'refresh:meva': fila({
        clau: 'refresh:meva',
        status: 'completed',
        result: {
          cache: 'stale',
          updatedAt: '2026-08-10T06:00:00.000Z',
          storyCount: 12,
        },
      }),
    })
    const res = await worker.fetch(estat('refresh:meva'), env, ctx)
    const feina = await res.json()
    expect(feina.status).toBe('completed')
    expect(feina.result.cache).toBe('stale')
    expect(feina.result.updatedAt).toBe('2026-08-10T06:00:00.000Z')
    expect(feina.result.storyCount).toBe(12)
  })

  it('una feina fallida es veu, amb el motiu', async () => {
    const env = envAmbFeines({
      'refresh:meva': fila({
        clau: 'refresh:meva',
        status: 'failed',
        error: 'cap font no respon',
      }),
    })
    const res = await worker.fetch(estat('refresh:meva'), env, ctx)
    const feina = await res.json()
    expect(feina.status).toBe('failed')
    expect(feina.error).toBe('cap font no respon')
  })

  it('si la cua encara no l’ha repartida, ho diu en lloc de fer 404', async () => {
    const res = await worker.fetch(estat('refresh:encara-no'), envAmbFeines({}), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('queued')
  })

  it('sense testimoni no diu res de la maquinària', async () => {
    const res = await worker.fetch(estat('refresh:meva', null), envAmbFeines({}), ctx)
    expect(res.status).toBe(401)
  })

  it('sense clau, ho diu clarament', async () => {
    const res = await worker.fetch(
      new Request('https://bondiari.com/api/pipeline-job', {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
      envAmbFeines({}),
      ctx,
    )
    expect(res.status).toBe(400)
  })
})
