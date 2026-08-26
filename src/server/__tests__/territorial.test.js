import { describe, expect, it } from 'vitest'
import worker from '../../worker.js'
import {
  TERRITORIAL_CACHE_PREFIX,
  TERRITORIAL_DEGRADED_TTL_SECONDS,
  TERRITORIAL_FRESH_TTL_SECONDS,
  TERRITORIAL_RETENTION_TTL_SECONDS,
  TerritorialUnavailableError,
  getTerritorialPayload,
  handleTerritorialRequest,
} from '../territorial.js'
import {
  collectRaiscOpportunities,
  normalizeAgendaWidgetItem,
} from '../rss/serviceFeeds.js'

const NOW = Date.parse('2026-08-26T12:00:00.000Z')

function agendaHtml() {
  return `
    <div class="posa-bloc"><div class="posa-result">
      <div class="posa_denominacio"><a href="/ca/activitat.html?article=1"><p>Concert de prova</p></a></div>
      <div class="posa_lloc"><span>Mataró</span></div>
      <div class="posa_dataInici"><span>Inici: 26/08/2026 Fi: 30/08/2026</span></div>
    </div></div>`
}

function idescatPayload() {
  return {
    fitxes: {
      indicadors: {
        i: [
          {
            id: 'f171',
            c: 'Població',
            v: '477375,8134000',
            u: 'habitants',
            r: '2025',
            updated: '2026-05-07T10:00:00+00:00',
            l: 'https://www.idescat.cat/pub/?id=censph&amp;geo=com:21',
          },
        ],
      },
    },
  }
}

function raiscPayload() {
  return [
    {
      codi_raisc: '7495-25-199',
      t_tol_convocat_ria_catal: 'Beques de pràctiques culturals',
      data_concessio: '2026-07-24T00:00:00.000',
      import_total: '7638.40',
      concessions: '3',
    },
  ]
}

function makeOfficialFetch({ fail = [] } = {}) {
  const calls = []
  const fetchFn = async (input) => {
    const url = new URL(input)
    calls.push(url)
    if (fail.some((part) => url.href.includes(part))) {
      return new Response('upstream failed', { status: 503 })
    }
    if (url.hostname === 'agenda.cultura.gencat.cat') {
      return new Response(agendaHtml(), {
        headers: { 'content-type': 'text/html' },
      })
    }
    if (url.pathname.includes('s9xt-n979')) {
      return Response.json(raiscPayload())
    }
    if (url.hostname === 'api.idescat.cat') {
      return Response.json(idescatPayload())
    }
    throw new Error(`Unexpected URL: ${url}`)
  }
  return { calls, fetchFn }
}

function makeKv(initial = null) {
  let value = initial
  const gets = []
  const puts = []
  return {
    gets,
    puts,
    async get(key, type) {
      gets.push({ key, type })
      return value
    },
    async put(key, nextValue, options) {
      puts.push({ key, value: nextValue, options })
      value = JSON.parse(nextValue)
    },
    current: () => value,
  }
}

describe('territorial service', () => {
  it('manté elements d’Agenda amb camps oficials buits sense inferir-los', () => {
    const item = normalizeAgendaWidgetItem(
      {
        href: '/ca/activitat.html?article=1',
        title: 'Concert &#x110000; de prova',
        place: '',
        dateLabel: '',
      },
      undefined,
      '2026-08-26T12:00:00.000Z',
    )

    expect(item.summary).toBe(
      'Dates per confirmar a la fitxa oficial · Lloc no especificat',
    )
    expect(item.location).toBe('Lloc no especificat')
    expect(item.title).toContain('&#x110000;')
  })

  it('no canvia l’abast històric del col·lector RAISC editorial', async () => {
    let requestedUrl
    await collectRaiscOpportunities({
      now: new Date(NOW),
      fetchFn: async (input) => {
        requestedUrl = new URL(input)
        return Response.json([])
      },
    })

    expect(requestedUrl.searchParams.get('$where')).not.toContain(
      'codi_regio_apli',
    )
  })

  it('fa exactament tres fetches en cold miss i desa una única resposta composta', async () => {
    const kv = makeKv()
    const official = makeOfficialFetch()
    const payload = await getTerritorialPayload(
      { LIVE_NEWS_KV: kv },
      '21',
      { fetchFn: official.fetchFn, nowMs: NOW },
    )

    expect(official.calls).toHaveLength(3)
    expect(kv.gets).toEqual([
      { key: `${TERRITORIAL_CACHE_PREFIX}21`, type: 'json' },
    ])
    expect(kv.puts).toHaveLength(1)
    expect(kv.puts[0].options.expirationTtl).toBe(
      TERRITORIAL_RETENTION_TTL_SECONDS,
    )
    expect(payload.cache.status).toBe('miss')
    expect(payload.cache.freshTtlSeconds).toBe(TERRITORIAL_FRESH_TTL_SECONDS)
    expect(payload.sources.agenda.items[0].summary).toContain('Mataró')
    expect(payload.sources.raisc.items[0].summary).toContain('3 concessions')
    expect(payload.sources.idescat.items[0].summary).toContain('477375')

    const agendaUrl = official.calls.find((url) =>
      url.hostname.includes('agenda.cultura'),
    )
    expect(agendaUrl.searchParams.get('comarcaMunicipiTagId')).toContain(
      '/maresme',
    )
    expect(agendaUrl.searchParams.get('limit')).toBe('10')
    const raiscUrl = official.calls.find((url) =>
      url.pathname.includes('s9xt-n979'),
    )
    expect(raiscUrl.searchParams.get('$where')).toContain("codi_territorial = '21_08'")
    expect(raiscUrl.searchParams.get('$where')).toContain("finalitat_p_blica = 'Cultura'")
    expect(raiscUrl.searchParams.get('$select')).not.toContain('beneficiari')
    const idescatUrl = official.calls.find((url) =>
      url.hostname === 'api.idescat.cat',
    )
    expect(idescatUrl.searchParams.get('id')).toBe('21')
    expect(idescatUrl.searchParams.get('i')).toBe('f171,f261,f262')
  })

  it('serveix un warm hit de KV sense cap fetch extern', async () => {
    const firstKv = makeKv()
    const firstFetch = makeOfficialFetch()
    await getTerritorialPayload(
      { LIVE_NEWS_KV: firstKv },
      '13',
      { fetchFn: firstFetch.fetchFn, nowMs: NOW },
    )

    const kv = makeKv(firstKv.current())
    let externalFetches = 0
    const payload = await getTerritorialPayload(
      { LIVE_NEWS_KV: kv },
      '13',
      {
        fetchFn: async () => {
          externalFetches += 1
          throw new Error('warm hit must not fetch')
        },
        nowMs: NOW + 1000,
      },
    )

    expect(externalFetches).toBe(0)
    expect(payload.cache.status).toBe('hit')
    expect(kv.puts).toHaveLength(0)
  })

  it('manté les fonts bones i usa un TTL curt quan una font falla', async () => {
    const kv = makeKv()
    const official = makeOfficialFetch({ fail: ['widget_posa'] })
    const payload = await getTerritorialPayload(
      { LIVE_NEWS_KV: kv },
      '13',
      { fetchFn: official.fetchFn, nowMs: NOW },
    )

    expect(official.calls).toHaveLength(3)
    expect(payload.status).toBe('degraded')
    expect(payload.sources.agenda.status).toBe('error')
    expect(payload.sources.raisc.status).toBe('ok')
    expect(payload.sources.idescat.status).toBe('ok')
    expect(payload.cache.freshTtlSeconds).toBe(
      TERRITORIAL_DEGRADED_TTL_SECONDS,
    )
  })

  it('recupera només la font fallida des d’una còpia retinguda', async () => {
    const seededKv = makeKv()
    const seededFetch = makeOfficialFetch()
    await getTerritorialPayload(
      { LIVE_NEWS_KV: seededKv },
      '21',
      { fetchFn: seededFetch.fetchFn, nowMs: NOW },
    )
    const stale = seededKv.current()
    stale.freshUntil = new Date(NOW - 1000).toISOString()

    const kv = makeKv(stale)
    const official = makeOfficialFetch({ fail: ['widget_posa'] })
    const payload = await getTerritorialPayload(
      { LIVE_NEWS_KV: kv },
      '21',
      { fetchFn: official.fetchFn, nowMs: NOW + 1000 },
    )

    expect(payload.sources.agenda.status).toBe('stale')
    expect(payload.sources.agenda.items).toHaveLength(1)
    expect(payload.cache.status).toBe('refresh')
  })

  it('no allarga indefinidament una font stale en refrescos parcials', async () => {
    const seededKv = makeKv()
    await getTerritorialPayload(
      { LIVE_NEWS_KV: seededKv },
      '21',
      { fetchFn: makeOfficialFetch().fetchFn, nowMs: NOW },
    )
    const firstStale = seededKv.current()
    firstStale.freshUntil = new Date(NOW - 1000).toISOString()

    const refreshingKv = makeKv(firstStale)
    const agendaDown = makeOfficialFetch({ fail: ['widget_posa'] })
    const refreshAt = NOW + (23 * 60 + 50) * 60 * 1000
    const refreshed = await getTerritorialPayload(
      { LIVE_NEWS_KV: refreshingKv },
      '21',
      { fetchFn: agendaDown.fetchFn, nowMs: refreshAt },
    )
    expect(refreshed.sources.agenda.status).toBe('stale')
    expect(refreshed.sources.agenda.retainedUntil).toBe(
      new Date(NOW + TERRITORIAL_RETENTION_TTL_SECONDS * 1000).toISOString(),
    )
    expect(refreshed.freshUntil).toBe(refreshed.sources.agenda.retainedUntil)
    expect(refreshed.freshTtlSeconds).toBe(10 * 60)

    const later = refreshingKv.current()
    later.freshUntil = new Date(NOW - 1000).toISOString()
    const expired = await getTerritorialPayload(
      { LIVE_NEWS_KV: makeKv(later) },
      '21',
      {
        fetchFn: agendaDown.fetchFn,
        nowMs: NOW + TERRITORIAL_RETENTION_TTL_SECONDS * 1000 + 1000,
      },
    )

    expect(expired.sources.agenda.status).toBe('error')
    expect(expired.sources.agenda.items).toHaveLength(0)
    expect(expired.sources.raisc.status).toBe('ok')
  })

  it('rebutja un JSON oficial que supera el límit de resposta', async () => {
    const calls = []
    const fetchFn = async (input) => {
      const url = new URL(input)
      calls.push(url)
      if (url.pathname.includes('s9xt-n979')) {
        return Response.json([{ padding: 'x'.repeat(310_000) }])
      }
      if (url.hostname === 'agenda.cultura.gencat.cat') {
        return new Response(agendaHtml())
      }
      return Response.json(idescatPayload())
    }

    const payload = await getTerritorialPayload(
      { LIVE_NEWS_KV: makeKv() },
      '13',
      { fetchFn, nowMs: NOW },
    )

    expect(calls).toHaveLength(3)
    expect(payload.sources.raisc.status).toBe('error')
    expect(payload.status).toBe('degraded')
  })

  it('falla amb 503 lògic si les tres fonts fallen i no hi ha còpia', async () => {
    const official = makeOfficialFetch({
      fail: ['widget_posa', 's9xt-n979', 'api.idescat.cat'],
    })
    await expect(
      getTerritorialPayload(
        { LIVE_NEWS_KV: makeKv() },
        '21',
        { fetchFn: official.fetchFn, nowMs: NOW },
      ),
    ).rejects.toBeInstanceOf(TerritorialUnavailableError)
    expect(official.calls).toHaveLength(3)
  })

  it('rebutja comarca i mètode invàlids abans de consultar cap font', async () => {
    const invalid = await handleTerritorialRequest(
      new Request('https://bondiari.com/api/territorial?comarca=99'),
      { LIVE_NEWS_KV: makeKv() },
    )
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ error: 'unsupported-comarca' })

    const method = await handleTerritorialRequest(
      new Request('https://bondiari.com/api/territorial?comarca=21', {
        method: 'POST',
      }),
      { LIVE_NEWS_KV: makeKv() },
    )
    expect(method.status).toBe(405)
    expect(method.headers.get('allow')).toBe('GET, HEAD')
  })

  it('integra la ruta al Worker i conserva les capçaleres de seguretat', async () => {
    const now = Date.now()
    const cached = {
      version: 1,
      ok: true,
      status: 'ready',
      comarca: { id: '21', slug: 'maresme', name: 'Maresme' },
      updatedAt: new Date(now).toISOString(),
      freshUntil: new Date(now + 60_000).toISOString(),
      retainedUntil: new Date(now + 120_000).toISOString(),
      freshTtlSeconds: TERRITORIAL_FRESH_TTL_SECONDS,
      sources: {
        agenda: { status: 'empty', items: [] },
        raisc: { status: 'empty', items: [] },
        idescat: { status: 'empty', items: [] },
      },
    }
    const response = await worker.fetch(
      new Request('https://bondiari.com/api/territorial?comarca=21'),
      { LIVE_NEWS_KV: makeKv(cached) },
      {},
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('x-bondiari-cache')).toBe('hit')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
