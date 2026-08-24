// Validació recurrent de les fonts amb una llicència editorial explícita.
// No és una auditoria feta un sol dia: el radar l'executa abans de processar
// cada feed del pivot. Si una font deixa de respondre, deixa de ser XML o no
// publica ítems recents, no n'entra cap peça al circuit corresponent.

const DEFAULT_MAX_ITEM_AGE_MS = 60 * 24 * 60 * 60 * 1000

function cleanXmlText(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTag(block, tag) {
  const match = String(block || '').match(
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  )
  return match ? match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim() : ''
}

function extractAtomLink(block) {
  const match = String(block || '').match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i)
  return match ? match[1] : ''
}

function extractEuropePmcEntries(xml) {
  const entries = []
  const resultRegex = /<result\b[^>]*>([\s\S]*?)<\/result>/gi
  let match
  while ((match = resultRegex.exec(String(xml || ''))) !== null) {
    const block = match[1]
    const pmcid = cleanXmlText(extractTag(block, 'pmcid'))
    const title = cleanXmlText(extractTag(block, 'title'))
    const publishedAt = cleanXmlText(extractTag(block, 'firstPublicationDate'))
    const license = cleanXmlText(extractTag(block, 'license'))
    const pubTypes = [...block.matchAll(/<pubType\b[^>]*>([\s\S]*?)<\/pubType>/gi)]
      .map((item) => cleanXmlText(item[1]).toLowerCase())
    const isPeerReviewedStudy =
      pubTypes.includes('journal article') && !pubTypes.every((type) => type === 'review')
    if (!pmcid || !title || !publishedAt || !isPeerReviewedStudy) continue
    entries.push({
      title,
      url: `https://europepmc.org/articles/${pmcid}`,
      publishedAt,
      license,
    })
  }
  return entries
}

export function extractFeedEntries(xml) {
  if (/<responseWrapper\b/i.test(String(xml || ''))) {
    return extractEuropePmcEntries(xml)
  }
  const entries = []
  const itemRegex = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let match
  while ((match = itemRegex.exec(String(xml || ''))) !== null) {
    const block = match[2]
    entries.push({
      title: extractTag(block, 'title'),
      url: extractTag(block, 'link') || extractAtomLink(block),
      publishedAt:
        extractTag(block, 'pubDate') ||
        extractTag(block, 'published') ||
        extractTag(block, 'updated'),
    })
  }
  return entries
}

export function isValidConfiguredFeedXml(feed, xml) {
  if (feed?.format === 'europe-pmc-search') {
    return /<responseWrapper\b/i.test(String(xml || ''))
  }
  return /<rss[\s>]|<feed[\s>]/i.test(String(xml || ''))
}

export function validateFeedActivation(feed, xml, now = Date.now()) {
  const activation = feed?.activation
  if (!activation?.required) return { active: true, reason: null, entries: [] }

  if (!activation.licenseConfirmed || !String(feed?.reuseLicense || '').trim()) {
    return { active: false, reason: 'llicència de la font no confirmada', entries: [] }
  }
  if (!isValidConfiguredFeedXml(feed, xml)) {
    return { active: false, reason: 'XML RSS/Atom invàlid', entries: [] }
  }

  const entries = extractFeedEntries(xml)
  if (!entries.length) {
    return { active: false, reason: 'RSS/Atom sense ítems parsejables', entries }
  }

  const maxAgeMs = activation.maxItemAgeMs || DEFAULT_MAX_ITEM_AGE_MS
  const hasRecentItem = entries.some((entry) => {
    const publishedAt = new Date(entry.publishedAt).getTime()
    return (
      Boolean(entry.title && entry.url) &&
      Number.isFinite(publishedAt) &&
      publishedAt <= now + 24 * 60 * 60 * 1000 &&
      now - publishedAt <= maxAgeMs
    )
  })
  if (!hasRecentItem) {
    return { active: false, reason: 'cap ítem recent i parsejable', entries }
  }
  return { active: true, reason: null, entries }
}
