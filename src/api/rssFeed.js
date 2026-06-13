// Front: petició al Worker per llegir el lot del radar en viu. Tota la lògica
// de filtre, scraping i parsing viu al servidor (src/server/liveNews.js).
// Aquest fitxer és un client HTTP fi i prou.

const liveNewsEndpoint = '/api/live-news'

export async function fetchLivePositiveNewsPayload({ force = false } = {}) {
  const params = new URLSearchParams()
  if (force) params.set('force', '1')
  const url = params.toString() ? `${liveNewsEndpoint}?${params}` : liveNewsEndpoint

  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`El radar ha retornat ${response.status}`)
  }
  const payload = await response.json()
  if (!Array.isArray(payload.stories)) {
    throw new Error('El radar no ha retornat cap llista de notícies.')
  }
  return payload
}
