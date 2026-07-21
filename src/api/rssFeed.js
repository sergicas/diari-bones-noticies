// Front: petició al Worker per llegir el lot del radar en viu. Tota la lògica
// de filtre, scraping i parsing viu al servidor (src/server/liveNews.js).
// Aquest fitxer és un client HTTP fi i prou.

const liveNewsEndpoint = '/api/live-news'

export async function fetchLivePositiveNewsPayload() {
  // 'no-store': el radar és en viu; mai volem una còpia cachejada pel navegador
  // o un service worker antic. Combina amb el 'no-store' de la resposta del Worker.
  const response = await fetch(liveNewsEndpoint, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`El radar ha retornat ${response.status}`)
  }
  const payload = await response.json()
  if (!Array.isArray(payload.stories)) {
    throw new Error('El radar no ha retornat cap llista de notícies.')
  }
  return payload
}

// Secció "En directe": titulars lleugers que enllacen a la font. És a part del
// radar principal i es refresca contínuament.
const liveTickerEndpoint = '/api/live-ticker'

export async function fetchLiveTicker() {
  const response = await fetch(liveTickerEndpoint, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`El directe ha retornat ${response.status}`)
  }
  const payload = await response.json()
  return {
    updatedAt: payload.updatedAt || null,
    items: Array.isArray(payload.items) ? payload.items : [],
  }
}
