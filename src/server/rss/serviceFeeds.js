// Fonts de servei estructurades (Agenda Cultural, RAISC i Idescat) per a El Bon Diari.

import { storyImagePath } from '../../lib/story-image-path.js'
import { LIVE_EDITORIAL_VERSION } from '../../lib/editorial-version.js'

const liveEditorialVersion = LIVE_EDITORIAL_VERSION

const agendaFeedBaseUrl =
  'https://agenda.cultura.gencat.cat/content/agenda/ca/rss/resultats.html'
const agendaWidgetBaseUrl =
  'https://agenda.cultura.gencat.cat/content/agenda/ca/posa/jcr:content/root/container/agendagrid/par_1/widget_posa.html'
const agendaAmbitIds = [
  'arts-visuals',
  'cinema',
  'divulgacio',
  'espectacles',
  'gastronomia',
  'llibres-i-lletres',
  'musica',
  'tradicional-i-popular',
  'zz-altres-ambits',
]
const raiscApiUrl =
  'https://analisi.transparenciacatalunya.cat/resource/khxn-nv6a.json'
const raiscConcessionsApiUrl =
  'https://analisi.transparenciacatalunya.cat/resource/s9xt-n979.json'
const idescatApiUrl = 'https://api.idescat.cat/emex/v1/dades.json'

const defaultServiceTerritory = Object.freeze({
  id: '081213',
  name: 'Mataró',
  location: 'Mataró, Maresme',
  agendaTag: 'agenda:ubicacions/barcelona/maresme/mataro',
  idescatId: '081213',
})

export function buildAgendaFeedUrl(territory = defaultServiceTerritory) {
  return buildAgendaUrl(agendaFeedBaseUrl, territory)
}

function buildAgendaUrl(baseUrl, territory, limit = null) {
  const url = new URL(baseUrl)
  url.searchParams.append(
    'comarcaMunicipiTagId',
    territory.agendaTag || defaultServiceTerritory.agendaTag,
  )
  for (const ambit of agendaAmbitIds) {
    url.searchParams.append('ambitIds', `agenda:ambits/${ambit}`)
  }
  if (limit) url.searchParams.set('limit', String(limit))
  return url.toString()
}

export function buildAgendaWidgetUrl(
  territory = defaultServiceTerritory,
  limit = 10,
) {
  return buildAgendaUrl(
    agendaWidgetBaseUrl,
    territory,
    Math.max(1, Math.min(20, Number(limit) || 10)),
  )
}

export function buildIdescatApiUrl(territory = defaultServiceTerritory) {
  const url = new URL(idescatApiUrl)
  url.searchParams.set(
    'id',
    territory.idescatId || territory.id || defaultServiceTerritory.idescatId,
  )
  if (Array.isArray(territory.idescatIndicators)) {
    const indicators = territory.idescatIndicators.filter(Boolean).slice(0, 5)
    if (indicators.length) url.searchParams.set('i', indicators.join(','))
  }
  url.searchParams.set('lang', 'ca')
  return url.toString()
}

function decodeHtmlEntities(str = '') {
  const decodeNumericEntity = (match, value, radix) => {
    const codePoint = Number.parseInt(value, radix)
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
      return match
    }
    return String.fromCodePoint(codePoint)
  }

  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (match, value) =>
      decodeNumericEntity(match, value, 16),
    )
    .replace(/&#(\d+);/g, (match, value) =>
      decodeNumericEntity(match, value, 10),
    )
}

function stripHtml(html = '') {
  return html
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTag(xmlBlock, tagName) {
  const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i')
  const match = regex.exec(xmlBlock)
  return match ? match[1].trim() : ''
}

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function serviceStory({
  title,
  category,
  summary,
  impact,
  source,
  url,
  publishedAt,
  editorialFormat,
  expiresAt,
  location = 'Catalunya',
  body,
  sourceContext = '',
  requiresRewrite = false,
}) {
  if (!title || !url || !publishedAt) return null
  const ownBody = Array.isArray(body) ? body.filter(Boolean) : []
  return {
    title,
    category,
    location,
    summary,
    impact,
    source,
    sourceTier: 'A',
    editorialFormat,
    language: 'ca',
    url,
    imageUrl: storyImagePath(url, { title, category }),
    imageAlt: `Il·lustració editorial per a ${title}.`,
    imageCredit: 'El Bon Diari (il·lustració IA)',
    imageAttributionUrl: '',
    editorialScore: 1,
    curated: true,
    body: requiresRewrite ? [] : ownBody,
    ownContent: !requiresRewrite && ownBody.length > 0,
    ...(sourceContext ? { sourceContext } : {}),
    editorialVersion: liveEditorialVersion,
    publishedAt,
    ...(expiresAt ? { expiresAt } : {}),
  }
}

export async function fetchAndReadWithTimeout(
  url,
  init = {},
  readerFn = (res, _signal) => res.text(),
  timeoutMs = 6000,
  fetchFn = fetch,
) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(url, {
      ...init,
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, status: response.status, data: null }

    if (controller.signal.aborted) {
      throw new Error('Aborted by signal timeout')
    }

    const abortPromise = new Promise((_, reject) => {
      if (controller.signal.aborted) {
        reject(new Error('Aborted by signal timeout'))
      } else {
        controller.signal.addEventListener(
          'abort',
          () => {
            if (response.body && typeof response.body.cancel === 'function') {
              response.body.cancel().catch(() => {})
            }
            reject(new Error('Aborted by signal timeout'))
          },
          { once: true },
        )
      }
    })

    const data = await Promise.race([
      readerFn(response, controller.signal),
      abortPromise,
    ])
    return { ok: true, status: response.status, data }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function readTextBounded(
  response,
  signal,
  maxBytes = 1_100_000,
) {
  if (!response.body?.getReader) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error('Response body exceeds the configured limit')
    }
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let totalBytes = 0
  let text = ''

  try {
    while (true) {
      if (signal?.aborted) throw new Error('Aborted by signal timeout')
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        throw new Error('Response body exceeds the configured limit')
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    if (totalBytes > maxBytes || signal?.aborted) {
      await reader.cancel().catch(() => {})
    }
  }
}

async function readJsonBounded(response, signal, maxBytes = 300_000) {
  const text = await readTextBounded(response, signal, maxBytes)
  return JSON.parse(text)
}

export function normalizeAgendaItem(
  block,
  publishedAt = new Date().toISOString(),
  territory = defaultServiceTerritory,
) {
  const title = decodeHtmlEntities(stripHtml(extractTag(block, 'title')))
  const url = decodeHtmlEntities(extractTag(block, 'link')).replace(
    'agenda.cultura.gencat.cat:443',
    'agenda.cultura.gencat.cat',
  )
  const details = decodeHtmlEntities(
    stripHtml(
      extractTag(block, 'description') ||
      extractTag(block, 'summary') ||
      extractTag(block, 'content:encoded'),
    ),
  )
  // Una agenda sense data, lloc o descripció no és encara una peça de servei.
  if (details.split(/\s+/u).filter(Boolean).length < 20) return null
  const summary = details.slice(0, 260)
  return serviceStory({
    title,
    category: 'Agenda',
    summary,
    impact:
      'La fitxa permet decidir si l’activitat encaixa per data, lloc i condicions d’accés.',
    source: 'Agenda Cultural',
    url,
    publishedAt,
    editorialFormat: 'agenda',
    location: territory.location || territory.name || 'Catalunya',
    sourceContext: details.slice(0, 1400),
    requiresRewrite: true,
  })
}

export async function collectAgendaStories({
  territory = defaultServiceTerritory,
  fetchFn = fetch,
  timeoutMs = 6000,
} = {}) {
  try {
    const res = await fetchAndReadWithTimeout(
      buildAgendaFeedUrl(territory),
      {
        headers: {
          accept: 'application/rss+xml, application/xml, text/xml',
          'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
        },
      },
      (r, signal) => readTextBounded(r, signal),
      timeoutMs,
      fetchFn,
    )
    if (!res.ok || !res.data) {
      return { stories: [], candidates: 0, status: 'error' }
    }
    const xml = res.data
    if (!/<rss[\s>]/i.test(xml)) {
      console.warn(`[servei] Agenda ha retornat una resposta invàlida (${xml.length} bytes)`)
      return { stories: [], candidates: 0, status: 'error' }
    }
    const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi
    const stories = []
    let candidates = 0
    let match
    const snapshotAt = new Date().toISOString()
    while ((match = itemRegex.exec(xml)) !== null && stories.length < 6) {
      candidates += 1
      const story = normalizeAgendaItem(match[1], snapshotAt, territory)
      if (story) stories.push(story)
    }
    return { stories, candidates, status: stories.length ? 'ok' : 'empty' }
  } catch (error) {
    console.warn('[servei] Ha fallat l’Agenda Cultural', error?.message || error)
    return { stories: [], candidates: 0, status: 'error' }
  }
}

function agendaDateToIso(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
  return match ? `${match[3]}-${match[2]}-${match[1]}T23:59:59.999Z` : ''
}

export function normalizeAgendaWidgetItem(
  { href, title, place, dateLabel },
  _territory = defaultServiceTerritory,
  publishedAt = new Date().toISOString(),
) {
  const cleanTitle = decodeHtmlEntities(stripHtml(title))
  const cleanPlace = decodeHtmlEntities(stripHtml(place))
  const cleanDate = decodeHtmlEntities(stripHtml(dateLabel))
  if (!cleanTitle || !href) return null

  const url = new URL(href, 'https://agenda.cultura.gencat.cat').toString()
  const endDate = cleanDate.match(/Fi:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1]
  const placeLabel = cleanPlace || 'Lloc no especificat'
  const dateLabelText = cleanDate || 'Dates per confirmar a la fitxa oficial'
  return serviceStory({
    title: cleanTitle,
    category: 'Agenda',
    summary: `${dateLabelText} · ${placeLabel}`,
    impact:
      'La fitxa oficial permet comprovar horaris, accés i possibles canvis abans d’anar-hi.',
    source: 'Agenda Cultural',
    url,
    publishedAt,
    editorialFormat: 'agenda',
    expiresAt: agendaDateToIso(endDate),
    location: placeLabel,
    body: [
      `${cleanTitle} consta a l’Agenda Cultural${cleanPlace ? ` per a ${cleanPlace}` : ''}.`,
      `${dateLabelText}. La fitxa oficial enllaçada conté els horaris i les condicions actualitzades.`,
    ],
  })
}

export async function collectAgendaWidgetStories({
  territory = defaultServiceTerritory,
  fetchFn = fetch,
  timeoutMs = 6000,
  limit = 10,
} = {}) {
  try {
    const res = await fetchAndReadWithTimeout(
      buildAgendaWidgetUrl(territory, limit),
      {
        headers: {
          accept: 'text/html',
          'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
        },
      },
      (response, signal) => readTextBounded(response, signal, 150_000),
      timeoutMs,
      fetchFn,
    )
    if (!res.ok || !res.data) {
      return { stories: [], candidates: 0, status: 'error' }
    }

    const itemRegex =
      /posa_denominacio[\s\S]*?<a\s+href="([^"]+)"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?posa_lloc[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?posa_dataInici[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/gi
    const stories = []
    const snapshotAt = new Date().toISOString()
    let candidates = 0
    let match
    while ((match = itemRegex.exec(res.data)) !== null && stories.length < limit) {
      candidates += 1
      const story = normalizeAgendaWidgetItem(
        {
          href: match[1],
          title: match[2],
          place: match[3],
          dateLabel: match[4],
        },
        territory,
        snapshotAt,
      )
      if (story) stories.push(story)
    }
    return { stories, candidates, status: stories.length ? 'ok' : 'empty' }
  } catch (error) {
    console.warn('[servei] Ha fallat el giny de l’Agenda Cultural', error?.message || error)
    return { stories: [], candidates: 0, status: 'error' }
  }
}

function formatEuros(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return ''
  return new Intl.NumberFormat('ca-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function normalizeRaiscOpportunity(record) {
  const title =
    record.objecte_de_la_convocat_ria ||
    record.t_tol_convocat_ria_catal ||
    ''
  const url = record.seu_electr_nica || record.url_diari_oficial || ''
  const deadline = record.data_fi_termini_presentaci_sol_licitud || ''
  const beneficiaries =
    record.tipus_de_beneficiaris || 'les persones i entitats que compleixin les bases'
  const agency =
    record.entitat_oo_aa_o_departament_1 || 'l’organisme convocant'
  const purpose =
    record.finalitat_publica || record.objecte_de_la_convocat_ria || title
  const deadlineLabel = deadline
    ? new Date(deadline).toLocaleDateString('ca-ES')
    : 'el termini indicat a les bases'
  const amount = record.import_total_convocat_ria
    ? formatEuros(record.import_total_convocat_ria)
    : ''
  const parts = [
    `Destinataris: ${beneficiaries}`,
    deadline
      ? `Termini: ${deadlineLabel}`
      : '',
    amount ? `Dotació: ${amount}` : '',
  ].filter(Boolean)
  const body = [
    `La convocatòria té com a finalitat ${purpose} i s’adreça a ${beneficiaries}.`,
    `El termini de sol·licitud acaba el ${deadlineLabel}${amount ? ` i la dotació total anunciada és de ${amount}` : ''}.`,
    `${agency} n’és l’organisme responsable. Les bases i el document oficial enllaçat detallen els requisits, la documentació i el procediment de sol·licitud.`,
  ]
  return serviceStory({
    title,
    category: 'Oportunitats',
    summary: parts.join(' · '),
    impact:
      `Les persones destinatàries poden comprovar ara si compleixen els requisits abans del ${deadlineLabel}.`,
    source: 'Dades Obertes de Catalunya · RAISC',
    url,
    publishedAt:
      record.data_diari_oficial || new Date().toISOString(),
    editorialFormat: 'opportunity',
    expiresAt: deadline,
    location: record.regio_apli || 'Catalunya',
    body,
  })
}

export async function collectRaiscOpportunities({
  territory = defaultServiceTerritory,
  fetchFn = fetch,
  timeoutMs = 6000,
  now = new Date(),
} = {}) {
  try {
    const today = new Date(now)
    const horizon = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000)
    const start = `${today.toISOString().slice(0, 10)}T00:00:00.000`
    const end = `${horizon.toISOString().slice(0, 10)}T23:59:59.999`
    const fields = [
      'codi_raisc',
      't_tol_convocat_ria_catal',
      'entitat_oo_aa_o_departament_1',
      'data_diari_oficial',
      'url_diari_oficial',
      'tipus_de_beneficiaris',
      'import_total_convocat_ria',
      'data_fi_termini_presentaci_sol_licitud',
      'seu_electr_nica',
      'objecte_de_la_convocat_ria',
      'finalitat_publica',
      'regio_apli',
    ].join(',')
    const regionCodes = Array.isArray(territory.raiscRegionCodes)
      ? territory.raiscRegionCodes.filter(Boolean)
      : []
    const regionFilter = regionCodes.length
      ? ` AND codi_regio_apli IN (${regionCodes
          .map((code) => `'${String(code).replaceAll("'", "''")}'`)
          .join(',')})`
      : ''
    const query = new URLSearchParams({
      $select: fields,
      $where:
        `data_fi_termini_presentaci_sol_licitud >= '${start}' ` +
        `AND data_fi_termini_presentaci_sol_licitud <= '${end}'` +
        regionFilter,
      $order: 'data_fi_termini_presentaci_sol_licitud ASC',
      $limit: '12',
    })
    const res = await fetchAndReadWithTimeout(
      `${raiscApiUrl}?${query}`,
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
        },
      },
      (response, signal) => readJsonBounded(response, signal),
      timeoutMs,
      fetchFn,
    )
    if (!res.ok || !Array.isArray(res.data)) {
      return { stories: [], candidates: 0, status: 'error' }
    }
    const records = res.data
    const stories = records.map(normalizeRaiscOpportunity).filter(Boolean)
    return {
      stories,
      candidates: records.length,
      status: stories.length ? 'ok' : 'empty',
    }
  } catch (error) {
    console.warn('[servei] Ha fallat el registre RAISC', error?.message || error)
    return { stories: [], candidates: 0, status: 'error' }
  }
}

export function normalizeRaiscTerritorialGrant(
  record,
  territory = defaultServiceTerritory,
) {
  const title = record.t_tol_convocat_ria_catal || ''
  const url =
    record.url_oficial ||
    'https://analisi.transparenciacatalunya.cat/d/s9xt-n979'
  const amount = formatEuros(record.import_total)
  const concessions = Number(record.concessions || 0)
  const date = safeLocaleDate(record.data_concessio)
  return serviceStory({
    title,
    category: 'Dades',
    summary: [
      concessions
        ? `${concessions} ${concessions === 1 ? 'concessió' : 'concessions'}`
        : '',
      amount ? `Import agregat: ${amount}` : '',
      date ? `Darrera concessió: ${date}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    impact: `El registre permet seguir de manera agregada quins ajuts públics arriben al ${territory.name}.`,
    source: 'Dades Obertes de Catalunya · RAISC',
    url,
    publishedAt: record.data_concessio || new Date().toISOString(),
    editorialFormat: 'data',
    location: territory.location || territory.name,
    body: [
      `La consulta agrega ${concessions || 'les'} concessions culturals del codi territorial oficial del ${territory.name}.`,
      'El Bon Diari no demana ni exposa noms de persones beneficiàries, identificadors fiscals ni registres individuals.',
    ],
  })
}

function safeLocaleDate(value) {
  const timestamp = new Date(value || '').getTime()
  return Number.isNaN(timestamp)
    ? ''
    : new Date(timestamp).toLocaleDateString('ca-ES')
}

export async function collectRaiscTerritorialGrants({
  territory = defaultServiceTerritory,
  fetchFn = fetch,
  timeoutMs = 6000,
  now = new Date(),
} = {}) {
  try {
    if (!territory.raiscTerritorialCode) {
      return { stories: [], candidates: 0, status: 'error' }
    }
    const since = new Date(new Date(now).getTime() - 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const fields = [
      'codi_raisc',
      't_tol_convocat_ria_catal',
      'max(data_concessi) as data_concessio',
      'sum(import_subvenci_pr_stec_ajut) as import_total',
      'count(*) as concessions',
    ].join(',')
    const group = [
      'codi_raisc',
      't_tol_convocat_ria_catal',
    ].join(',')
    const code = String(territory.raiscTerritorialCode).replaceAll("'", "''")
    const query = new URLSearchParams({
      $select: fields,
      $where:
        `codi_territorial = '${code}' AND finalitat_p_blica = 'Cultura' ` +
        `AND data_concessi >= '${since}T00:00:00.000'`,
      $group: group,
      $order: 'data_concessio DESC',
      $limit: '6',
    })
    const res = await fetchAndReadWithTimeout(
      `${raiscConcessionsApiUrl}?${query}`,
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
        },
      },
      (response, signal) => readJsonBounded(response, signal),
      timeoutMs,
      fetchFn,
    )
    if (!res.ok || !Array.isArray(res.data)) {
      return { stories: [], candidates: 0, status: 'error' }
    }
    const stories = res.data
      .map((record) => normalizeRaiscTerritorialGrant(record, territory))
      .filter(Boolean)
    return {
      stories,
      candidates: res.data.length,
      status: stories.length ? 'ok' : 'empty',
    }
  } catch (error) {
    console.warn('[servei] Ha fallat el RAISC territorial', error?.message || error)
    return { stories: [], candidates: 0, status: 'error' }
  }
}

function collectObjects(value, predicate, result = []) {
  if (!value || typeof value !== 'object') return result
  if (predicate(value)) result.push(value)
  for (const child of Object.values(value)) {
    collectObjects(child, predicate, result)
  }
  return result
}

export function normalizeIdescatUpdate(
  table,
  territory = defaultServiceTerritory,
) {
  const rows = asArray(
    table?.ff?.f ||
      (table?.v ? { c: table.c, v: table.v, u: table.u } : null),
  )
    .filter((row) => row?.c && row?.v)
    .slice(0, 4)
  if (!table?.c || !table?.updated || !table?.l || rows.length === 0) {
    return null
  }
  const facts = rows.map((row) => {
    const localValue = String(row.v).split(',')[0]
    return `${row.c}: ${localValue}${row.u ? ` ${row.u}` : ''}`
  })
  const period = table.r || 'el darrer període publicat'
  const territoryName = territory.name || 'Catalunya'
  const territoryReference =
    territory.id === defaultServiceTerritory.id
      ? 'a Mataró'
      : `al ${territoryName}`
  const title = `Idescat actualitza ${table.c} ${territoryReference}`
  const versionUrl = `${decodeHtmlEntities(table.l)}#actualitzacio-${table.updated.slice(0, 10)}`
  return serviceStory({
    title,
    category: 'Dades',
    summary: `${table.c}${table.r ? ` (${table.r})` : ''}: ${facts.join(' · ')}`,
    impact:
      `La nova sèrie permet seguir l’evolució de ${table.c.toLocaleLowerCase('ca')} ${territoryReference} amb dades oficials.`,
    source: 'Idescat',
    url: versionUrl,
    publishedAt: table.updated,
    editorialFormat: 'data',
    location: territory.location || territoryName,
    body: [
      `Idescat ha actualitzat la taula «${table.c}» corresponent a ${period}.`,
      `Els valors publicats ${territoryReference} són: ${facts.join(' · ')}.`,
      'L’enllaç oficial permet consultar la sèrie completa, la metodologia i les revisions posteriors de les dades.',
    ],
  })
}

export async function collectIdescatUpdates({
  territory = defaultServiceTerritory,
  fetchFn = fetch,
  timeoutMs = 6000,
} = {}) {
  try {
    const res = await fetchAndReadWithTimeout(
      buildIdescatApiUrl(territory),
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
        },
      },
      (response, signal) => readJsonBounded(response, signal),
      timeoutMs,
      fetchFn,
    )
    if (!res.ok || !res.data) {
      return { stories: [], candidates: 0, status: 'error' }
    }
    const payload = res.data
    const selectedIndicators = asArray(payload?.fitxes?.indicadors?.i)
    const tables = (selectedIndicators.length
      ? selectedIndicators
      : collectObjects(
          payload,
          (value) =>
            /^t\d+$/.test(value?.id || '') &&
            value.updated &&
            !Number.isNaN(new Date(value.updated).getTime()),
        )
    ).sort(
      (left, right) =>
        new Date(right.updated).getTime() - new Date(left.updated).getTime(),
    )
    const stories = tables
      .slice(0, 4)
      .map((table) => normalizeIdescatUpdate(table, territory))
      .filter(Boolean)
    return {
      stories,
      candidates: tables.length,
      status: stories.length ? 'ok' : 'empty',
    }
  } catch (error) {
    console.warn('[servei] Ha fallat Idescat', error?.message || error)
    return { stories: [], candidates: 0, status: 'error' }
  }
}
