export class TerritorialApiError extends Error {
  constructor(message, status, payload = null) {
    super(message)
    this.name = 'TerritorialApiError'
    this.status = status
    this.payload = payload
  }
}

export async function fetchTerritorialPayload(comarcaId, { signal } = {}) {
  const params = new URLSearchParams({ comarca: String(comarcaId || '') })
  const response = await fetch(`/api/territorial?${params}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new TerritorialApiError(
      'Ara mateix no podem carregar les dades territorials.',
      response.status,
      payload,
    )
  }
  if (!payload?.comarca || !payload?.sources) {
    throw new TerritorialApiError(
      'La resposta territorial no té el format esperat.',
      response.status,
      payload,
    )
  }
  return payload
}
