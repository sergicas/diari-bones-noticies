// Validació recurrent de les fonts amb una llicència editorial explícita.
// No és una auditoria feta un sol dia: el radar l'executa abans de processar
// cada feed del pivot. Si una font deixa de respondre, deixa de ser XML o no
// publica ítems recents, no n'entra cap peça al circuit corresponent.

const DEFAULT_MAX_ITEM_AGE_MS = 60 * 24 * 60 * 60 * 1000

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

export function extractFeedEntries(xml) {
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

export function validateFeedActivation(feed, xml, now = Date.now()) {
  const activation = feed?.activation
  if (!activation?.required) return { active: true, reason: null, entries: [] }

  if (!activation.licenseConfirmed || !String(feed?.reuseLicense || '').trim()) {
    return { active: false, reason: 'llicència de la font no confirmada', entries: [] }
  }
  if (!/<rss[\s>]|<feed[\s>]/i.test(String(xml || ''))) {
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
