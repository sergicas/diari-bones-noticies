// Helpers de format i etiquetes per a les vistes del frontend

import { DEFAULT_STORY_IMAGE } from './imageRules.js'

const defaultStoryImage = DEFAULT_STORY_IMAGE

const dateFormatter = new Intl.DateTimeFormat('ca-ES', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('ca-ES', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(value) {
  if (!value) return ''
  return dateFormatter.format(new Date(value))
}

export function formatDateTime(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) {
    return ''
  }
  return dateTimeFormatter.format(date)
}

export const LANGUAGE_LABELS = {
  ca: 'Català',
  es: 'Castellà',
  en: 'Anglès',
  fr: 'Francès',
  de: 'Alemany',
  it: 'Italià',
  pt: 'Portuguès',
}

export function getLanguageLabel(code) {
  return LANGUAGE_LABELS[code] || code?.toUpperCase() || ''
}

export function handleImageError(event) {
  event.currentTarget.onerror = null
  event.currentTarget.src = defaultStoryImage
}
