// Barrera editorial mesurable per a les peces del radar.
//
// La generació correcta a nivell tècnic no implica qualitat periodística. Aquest
// mòdul separa els dos conceptes: una peça només es publica si aporta prou cos,
// estructura, utilitat i text específic. Els llindars varien segons el format,
// perquè una dada o una convocatòria no necessiten la mateixa extensió que una
// notícia o una verificació.

export const EDITORIAL_QUALITY_VERSION = 2

// Els llindars han d'estar calibrats amb el que el redactor automàtic escriu de
// debò. Amb 70 paraules i 4 frases (v1) se suspenia pràcticament tot: el model
// entrega cossos rigorosos i complets de 50-60 paraules en 3-4 frases, i la
// portada va caure de 35 peces a 3 en dos dies. 45 paraules i 3 frases
// segueixen descartant el breu buit sense castigar l'article ben fet.
const PROFILES = {
  constructive: { minBodyWords: 45, minSentences: 3, minImpactWords: 8 },
  verification: { minBodyWords: 45, minSentences: 3, minImpactWords: 8 },
  agenda: { minBodyWords: 40, minSentences: 3, minImpactWords: 8 },
  opportunity: { minBodyWords: 30, minSentences: 2, minImpactWords: 8 },
  data: { minBodyWords: 25, minSentences: 1, minImpactWords: 8 },
}

// Defectes de FONS: el text és de plantilla, buit o no identifica la font. Un
// text amb qualsevol d'aquests problemes no millora per molt que es reescrigui,
// i per tant es descarta ja en el moment de generar-lo.
//
// La llargada NO hi és a propòsit. Un cos una mica curt és un cos, i s'ha de
// jutjar UNA SOLA VEGADA, a la porta de publicació. Abans es descartava en
// generar-lo (deixant la peça sense cap text) i tot seguit es tornava a
// suspendre per estar buida: el mateix defecte castigat dues vegades, que és el
// que buidava el diari.
const SUBSTANTIVE_ISSUES = new Set([
  'generic-body',
  'generic-impact',
  'impact-repeated-in-body',
  'missing-source',
])

const GENERIC_BODY_PATTERNS = [
  /informaci[oó]_insuficient/i,
  /el radar autom[aà]tic/i,
  /ha publicat una comprovaci[oó] documentada sobre aquesta afirmaci[oó]/i,
  /aporta una comprovaci[oó] documentada per separar els fets del soroll/i,
  /consulta la font original per veure(?:’|')n totes les dades i el context/i,
  /inclou aquesta activitat entre les propostes disponibles/i,
]

const GENERIC_IMPACT_PATTERNS = [
  /^permet con[eè]ixer\b/i,
  /^informa sobre\b/i,
  /^aporta una comprovaci[oó] documentada\b/i,
  /^afegeix una proposta cultural\b/i,
  /^resumeix una convocat[oò]ria\b/i,
  /^actualitza un indicador p[uú]blic\b/i,
  /^el radar autom[aà]tic\b/i,
  /^aquesta (?:not[ií]cia|pe[çc]a) (?:[ée]s|es) [uú]til perqu[eè] informa\b/i,
]

function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function countWords(value) {
  const text = plainText(value)
  return text ? text.split(/\s+/u).filter(Boolean).length : 0
}

function countSentences(value) {
  const text = plainText(value)
  if (!text) return 0
  const matches = text.match(/[.!?](?:\s|$)/g)
  return Math.max(matches?.length || 0, text.length >= 40 ? 1 : 0)
}

function normalized(value) {
  return plainText(value)
    .toLocaleLowerCase('ca')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function editorialQualityProfile(format = 'constructive') {
  return PROFILES[format] || PROFILES.constructive
}

export function evaluateEditorialQuality(story) {
  const format = story?.editorialFormat || 'constructive'
  const profile = editorialQualityProfile(format)
  const title = plainText(story?.title)
  const body = Array.isArray(story?.body)
    ? story.body.map(plainText).filter(Boolean).join(' ')
    : plainText(story?.body)
  const impact = plainText(story?.impact)
  const metrics = {
    titleWords: countWords(title),
    bodyWords: countWords(body),
    sentences: countSentences(body),
    impactWords: countWords(impact),
  }
  const issues = []

  if (metrics.titleWords < 5 || metrics.titleWords > 20) {
    issues.push('title-length')
  }
  if (metrics.bodyWords < profile.minBodyWords) issues.push('body-too-short')
  if (metrics.sentences < profile.minSentences) issues.push('not-enough-sentences')
  if (metrics.impactWords < profile.minImpactWords) issues.push('impact-too-short')
  if (!story?.source || !story?.url) issues.push('missing-source')
  if (GENERIC_BODY_PATTERNS.some((pattern) => pattern.test(body))) {
    issues.push('generic-body')
  }
  if (GENERIC_IMPACT_PATTERNS.some((pattern) => pattern.test(impact))) {
    issues.push('generic-impact')
  }

  const bodyNormalized = normalized(body)
  const impactNormalized = normalized(impact)
  if (
    impactNormalized.length >= 30 &&
    bodyNormalized.includes(impactNormalized)
  ) {
    issues.push('impact-repeated-in-body')
  }

  const penalty = issues.length * 15
  const depthBonus = Math.min(30, Math.floor(metrics.bodyWords / 10) * 3)
  const score = Math.max(0, Math.min(100, 70 + depthBonus - penalty))

  return {
    passes: issues.length === 0,
    version: EDITORIAL_QUALITY_VERSION,
    format,
    score,
    metrics,
    issues,
  }
}

export function isPublishableStory(story) {
  return Boolean(story?.ownContent && evaluateEditorialQuality(story).passes)
}

// Serveix per decidir si CONSERVEM un text acabat de generar (o recuperat del
// cau). Exigeix titular i cos reals i cap defecte de fons; la llargada la
// valorarà després isPublishableStory, un sol cop.
export function isUsableRewrite(story) {
  const hasText = Boolean(
    String(story?.title || '').trim() &&
      (Array.isArray(story?.body) ? story.body : [story?.body])
        .filter(Boolean)
        .join(' ')
        .trim(),
  )
  if (!hasText) return false
  return !evaluateEditorialQuality(story).issues.some((issue) =>
    SUBSTANTIVE_ISSUES.has(issue),
  )
}

export function selectPublishableStories(stories, { onReject } = {}) {
  if (!Array.isArray(stories)) return []
  return stories.filter((story) => {
    const result = evaluateEditorialQuality(story)
    const passes = Boolean(story?.ownContent && result.passes)
    if (!passes && onReject) onReject(story, result)
    return passes
  })
}
