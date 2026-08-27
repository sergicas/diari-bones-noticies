// Regles compartides per garantir que cada notícia porta una imatge ORIGINAL:
// fotografia amb llicència/atribució o il·lustració editorial pròpia generada
// per peça. Les il·lustracions genèriques i els placeholders no són vàlids.
// L'usen el frontend (App.jsx), el CLI de validació i el script d'apply.

export const DEFAULT_STORY_IMAGE = '/story-images/default-news.svg'

const PLACEHOLDER_HINTS = [
  DEFAULT_STORY_IMAGE,
  '/story-images/default-news',
  'placeholder',
  'undefined',
  'null',
]

const ILLUSTRATION_PATH_HINT = '/story-images/'
const ILLUSTRATION_EXTENSIONS = ['.svg']
const EDITORIAL_PHOTO_PREFIX = '/story-images/editorial/'
const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']
// Il·lustració editorial pròpia generada per IA i servida per la ruta del
// Worker. És una imatge original i única per peça (cap risc de drets d'autor):
// compta com a imatge vàlida a tots els efectes. Vegeu src/server/storyImage.js.
const GENERATED_IMAGE_PREFIX = '/api/story-image/'
const INCOMPATIBLE_THIRD_PARTY_RIGHTS = new Set([
  'separate-license',
  'incompatible-license',
])

// Política única per a imatges institucionals: si la institució publica la
// imatge sencera sota CC BY 4.0 o domini públic, els crèdits de tercers que
// ja hi consten queden coberts. Només es rebutja una imatge quan la seva fitxa
// diu explícitament que una part té una llicència separada o incompatible.
export const INSTITUTION_IMAGE_RIGHTS_POLICY =
  'Es confia en la llicència CC BY 4.0 (o domini públic) amb què la institució publica la imatge SENCERA; els fons de tercers que la institució ja ha acreditat i alliberat hi queden coberts. Només es rebutja si el crèdit diu explícitament que una part té llicència separada o incompatible.'

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function looksLikePlaceholder(url) {
  const lower = url.trim().toLowerCase()
  return PLACEHOLDER_HINTS.some((hint) => lower.includes(hint.toLowerCase()))
}

function isLocalIllustration(url) {
  const lower = url.trim().toLowerCase()
  if (!lower.startsWith(ILLUSTRATION_PATH_HINT)) return false
  if (lower.startsWith(EDITORIAL_PHOTO_PREFIX)) return false
  return ILLUSTRATION_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function looksLikePhoto(url) {
  const lower = url.trim().toLowerCase()
  const stripped = lower.split('?')[0].split('#')[0]
  if (PHOTO_EXTENSIONS.some((ext) => stripped.endsWith(ext))) return true
  if (lower.startsWith('http://') || lower.startsWith('https://')) return true
  return false
}

export function classifyImage(url) {
  if (!isNonEmptyString(url)) return 'missing'
  if (looksLikePlaceholder(url)) return 'placeholder'
  if (url.trim().toLowerCase().startsWith(GENERATED_IMAGE_PREFIX)) return 'generated'
  if (isLocalIllustration(url)) return 'illustration'
  if (looksLikePhoto(url)) return 'photo'
  return 'unknown'
}

export function isGeneratedEditorialImage(story) {
  return classifyImage(story?.imageUrl) === 'generated'
}

export function hasExplicitlyIncompatibleThirdPartyRights(story) {
  return INCOMPATIBLE_THIRD_PARTY_RIGHTS.has(
    story?.imageRights?.thirdPartyLicenseStatus,
  )
}

export function hasPermissiveImageLicense(license) {
  const normalized = String(license || '').toLowerCase().replace(/\s+/g, ' ')
  // CC BY-NC i CC BY-ND contenen literalment "CC BY", però no són
  // llicències lliures: la primera prohibeix l'ús comercial i la segona les
  // adaptacions. Es rebutgen abans de comprovar les variants permeses perquè
  // una coincidència parcial no les pugui deixar passar.
  if (
    /(?:^|[-\s])(?:nc|nd)(?:[-\s\d.]|$)|non[-\s]?commercial|no[-\s]?derivatives?/.test(
      normalized,
    )
  ) {
    return false
  }
  return /\bcc\s*[- ]?by(?:\s*[- ]?sa)?(?:\s*\d(?:\.\d)?)?\b|\bcc0(?:\s*\d(?:\.\d)?)?\b|public domain|domini públic|pdm\b|gnu free documentation|free art license/.test(normalized)
}

// Un crèdit identifica la font, però no concedeix permís de reutilització.
// Qualsevol foto externa necessita una fitxa explícita de drets, amb una
// llicència lliure i l'enllaç que en permet comprovar l'origen.
export function hasVerifiedImageRights(story) {
  const rights = story?.imageRights
  if (!rights || typeof rights !== 'object') return false
  return (
    rights.verified === true &&
    isNonEmptyString(rights.license) &&
    hasPermissiveImageLicense(rights.license) &&
    isNonEmptyString(rights.proofUrl) &&
    !hasExplicitlyIncompatibleThirdPartyRights(story)
  )
}

export function canPublishStoryImage(story) {
  const kind = classifyImage(story?.imageUrl)
  return kind === 'generated' || (kind === 'photo' && hasVerifiedImageRights(story))
}

// Es conserva el nom per compatibilitat amb el frontend i els scripts; una
// "imatge original" és una il·lustració pròpia o una foto externa verificada.
export function hasOriginalPhoto(story) {
  return canPublishStoryImage(story)
}

export function validateArticleImage(article) {
  const errors = []
  const warnings = []
  const url = article?.imageUrl
  const kind = classifyImage(url)

  switch (kind) {
    case 'missing':
      errors.push('imageUrl buit o absent')
      break
    case 'placeholder':
      errors.push(`imageUrl és un placeholder (${url})`)
      break
    case 'illustration':
      errors.push(
        `imageUrl és una il·lustració interna (${url}); cal una fotografia original de la font`,
      )
      break
    case 'unknown':
      errors.push(
        `imageUrl no sembla una fotografia (${url}); usa una URL externa o un fitxer .jpg/.webp/.png a /story-images/editorial/`,
      )
      break
    default:
      break
  }

  if (kind === 'photo' && !hasVerifiedImageRights(article)) {
    errors.push(
      'foto externa sense imageRights verificats (cal llicència lliure, URL de prova i cap excepció incompatible)',
    )
  }

  if (!isNonEmptyString(article?.imageAlt)) {
    errors.push('imageAlt buit o absent (cal text alternatiu per accessibilitat)')
  }

  if (!isNonEmptyString(article?.imageCredit)) {
    warnings.push('imageCredit absent (recomanat per donar crèdit a la font)')
  }

  if (kind === 'photo' && !isNonEmptyString(article?.imageAttributionUrl)) {
    warnings.push('imageAttributionUrl absent (recomanat per enllaçar el crèdit)')
  }

  return { errors, warnings, ok: errors.length === 0, kind }
}

export function formatValidationReport(results) {
  const lines = []
  let totalErrors = 0
  let totalWarnings = 0

  for (const { id, title, errors, warnings } of results) {
    if (errors.length === 0 && warnings.length === 0) continue
    const header = `• ${id || '(sense id)'}${title ? ` — ${title}` : ''}`
    lines.push(header)
    for (const err of errors) {
      lines.push(`    ERROR  ${err}`)
      totalErrors += 1
    }
    for (const warn of warnings) {
      lines.push(`    AVÍS   ${warn}`)
      totalWarnings += 1
    }
  }

  return { text: lines.join('\n'), totalErrors, totalWarnings }
}
