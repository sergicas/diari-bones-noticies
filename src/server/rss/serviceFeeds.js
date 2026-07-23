// Fonts de servei estructurades (Agenda Cultural, RAISC i Idescat) per a El Bon Diari.

import { storyImagePath } from '../../lib/story-image-path.js'
import { LIVE_EDITORIAL_VERSION } from '../../lib/editorial-version.js'

const liveEditorialVersion = LIVE_EDITORIAL_VERSION

const agendaMataroFeedUrl =
  'https://agenda.cultura.gencat.cat/content/agenda/ca/rss/resultats.html?' +
  [
    'comarcaMunicipiTagId=agenda:ubicacions/barcelona/maresme/mataro',
    'ambitIds=agenda:ambits/arts-visuals',
    'ambitIds=agenda:ambits/cinema',
    'ambitIds=agenda:ambits/divulgacio',
    'ambitIds=agenda:ambits/espectacles',
    'ambitIds=agenda:ambits/gastronomia',
    'ambitIds=agenda:ambits/llibres-i-lletres',
    'ambitIds=agenda:ambits/musica',
    'ambitIds=agenda:ambits/tradicional-i-popular',
    'ambitIds=agenda:ambits/zz-altres-ambits',
  ].join('&')

const raiscApiUrl =
  'https://analisi.transparenciacatalunya.cat/resource/khxn-nv6a.json'
const idescatMataroApiUrl =
  'https://api.idescat.cat/emex/v1/dades.json?id=081213'

function decodeHtmlEntities(str = '') {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, '').trim()
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
}) {
  if (!title || !url || !publishedAt) return null
  const ownBody = [summary, impact].filter(Boolean)
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
    body: ownBody,
    ownContent: ownBody.length > 0,
    editorialVersion: liveEditorialVersion,
    publishedAt,
    ...(expiresAt ? { expiresAt } : {}),
  }
}

async function fetchAndReadWithTimeout(url, init = {}, readerFn = (res) => res.text(), timeoutMs = 6000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, status: response.status, data: null }
    const data = await readerFn(response)
    return { ok: true, status: response.status, data }
  } finally {
    clearTimeout(timeoutId)
  }
}

export function normalizeAgendaItem(block, publishedAt = new Date().toISOString()) {
  const title = decodeHtmlEntities(stripHtml(extractTag(block, 'title')))
  const url = decodeHtmlEntities(extractTag(block, 'link')).replace(
    'agenda.cultura.gencat.cat:443',
    'agenda.cultura.gencat.cat',
  )
  const summary =
    `L’Agenda Cultural de la Generalitat inclou «${title}» entre les ` +
    'activitats disponibles a Mataró.'
  return serviceStory({
    title,
    category: 'Agenda',
    summary,
    impact:
      'Afegeix una proposta cultural de proximitat a l’agenda del lector.',
    source: 'Agenda Cultural',
    url,
    publishedAt,
    editorialFormat: 'agenda',
    location: 'Mataró, Maresme',
  })
}

export async function collectAgendaStories() {
  try {
    const res = await fetchAndReadWithTimeout(
      agendaMataroFeedUrl,
      {
        headers: {
          accept: 'application/rss+xml, application/xml, text/xml',
          'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
        },
      },
      (r) => r.text(),
      6000,
    )
    if (!res.ok || !res.data) return { stories: [], candidates: 0 }
    const xml = res.data
    if (xml.length > 250_000 || !/<rss[\s>]/i.test(xml)) {
      console.warn(`[servei] Agenda ha retornat una resposta invàlida (${xml.length} bytes)`)
      return { stories: [], candidates: 0 }
    }
    const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi
    const stories = []
    let candidates = 0
    let match
    const snapshotAt = new Date().toISOString()
    while ((match = itemRegex.exec(xml)) !== null && stories.length < 6) {
      candidates += 1
      const story = normalizeAgendaItem(match[1], snapshotAt)
      if (story) stories.push(story)
    }
    return { stories, candidates }
  } catch (error) {
    console.warn('[servei] Ha fallat l’Agenda Cultural', error?.message || error)
    return { stories: [], candidates: 0 }
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
  const parts = [
    record.tipus_de_beneficiaris
      ? `Destinataris: ${record.tipus_de_beneficiaris}`
      : '',
    deadline
      ? `Termini: ${new Date(deadline).toLocaleDateString('ca-ES')}`
      : '',
    record.import_total_convocat_ria
      ? `Dotació: ${formatEuros(record.import_total_convocat_ria)}`
      : '',
  ].filter(Boolean)
  return serviceStory({
    title,
    category: 'Oportunitats',
    summary: parts.join(' · '),
    impact:
      'Resumeix una convocatòria oberta amb termini, destinataris i document oficial.',
    source: 'Dades Obertes de Catalunya · RAISC',
    url,
    publishedAt:
      record.data_diari_oficial || new Date().toISOString(),
    editorialFormat: 'opportunity',
    expiresAt: deadline,
    location: record.regio_apli || 'Catalunya',
  })
}

export async function collectRaiscOpportunities() {
  try {
    const today = new Date()
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
    const query = new URLSearchParams({
      $select: fields,
      $where:
        `data_fi_termini_presentaci_sol_licitud >= '${start}' ` +
        `AND data_fi_termini_presentaci_sol_licitud <= '${end}'`,
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
      (r) => r.json(),
      6000,
    )
    if (!res.ok || !Array.isArray(res.data)) return { stories: [], candidates: 0 }
    const records = res.data
    return {
      stories: records.map(normalizeRaiscOpportunity).filter(Boolean),
      candidates: records.length,
    }
  } catch (error) {
    console.warn('[servei] Ha fallat el registre RAISC', error?.message || error)
    return { stories: [], candidates: 0 }
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

export function normalizeIdescatUpdate(table) {
  const rows = asArray(table?.ff?.f)
    .filter((row) => row?.c && row?.v)
    .slice(0, 4)
  if (!table?.c || !table?.updated || !table?.l || rows.length === 0) {
    return null
  }
  const facts = rows.map((row) => {
    const localValue = String(row.v).split(',')[0]
    return `${row.c}: ${localValue}${row.u ? ` ${row.u}` : ''}`
  })
  const title = `Idescat actualitza ${table.c} a Mataró`
  const versionUrl = `${table.l}#actualitzacio-${table.updated.slice(0, 10)}`
  return serviceStory({
    title,
    category: 'Dades',
    summary: `${table.c}${table.r ? ` (${table.r})` : ''}: ${facts.join(' · ')}`,
    impact:
      'Actualitza un indicador públic de Mataró amb període, xifra i font originals.',
    source: 'Idescat',
    url: versionUrl,
    publishedAt: table.updated,
    editorialFormat: 'data',
    location: 'Mataró, Maresme',
  })
}

export async function collectIdescatUpdates() {
  try {
    const res = await fetchAndReadWithTimeout(
      idescatMataroApiUrl,
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
        },
      },
      (r) => r.json(),
      6000,
    )
    if (!res.ok || !res.data) return { stories: [], candidates: 0 }
    const payload = res.data
    const tables = collectObjects(
      payload,
      (value) =>
        /^t\d+$/.test(value?.id || '') &&
        value.updated &&
        !Number.isNaN(new Date(value.updated).getTime()),
    ).sort(
      (left, right) =>
        new Date(right.updated).getTime() - new Date(left.updated).getTime(),
    )
    return {
      stories: tables.slice(0, 4).map(normalizeIdescatUpdate).filter(Boolean),
      candidates: tables.length,
    }
  } catch (error) {
    console.warn('[servei] Ha fallat Idescat', error?.message || error)
    return { stories: [], candidates: 0 }
  }
}
