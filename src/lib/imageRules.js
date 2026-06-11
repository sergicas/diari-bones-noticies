// Regles compartides per garantir que cada notícia porta una imatge ORIGINAL
// (foto real de la font), no una il·lustració genèrica.
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
  if (isLocalIllustration(url)) return 'illustration'
  if (looksLikePhoto(url)) return 'photo'
  return 'unknown'
}

export function hasOriginalPhoto(story) {
  return classifyImage(story?.imageUrl) === 'photo'
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

  if (!isNonEmptyString(article?.imageAlt)) {
    errors.push('imageAlt buit o absent (cal text alternatiu per accessibilitat)')
  }

  if (!isNonEmptyString(article?.imageCredit)) {
    warnings.push('imageCredit absent (recomanat per donar crèdit a la font)')
  }

  if (!isNonEmptyString(article?.imageAttributionUrl)) {
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
