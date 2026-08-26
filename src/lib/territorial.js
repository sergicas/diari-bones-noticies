export const TERRITORIAL_COMARCA_STORAGE_KEY =
  'bondiari-territorial-comarca-v1'

export const TERRITORIAL_COMARQUES = Object.freeze([
  Object.freeze({ id: '13', slug: 'barcelones', name: 'Barcelonès' }),
  Object.freeze({ id: '21', slug: 'maresme', name: 'Maresme' }),
])

const territorialComarcaIds = new Set(
  TERRITORIAL_COMARQUES.map((comarca) => comarca.id),
)

export function normalizeTerritorialComarcaId(value) {
  const id = String(value || '').trim()
  return territorialComarcaIds.has(id) ? id : ''
}

export function getTerritorialComarca(value) {
  const id = normalizeTerritorialComarcaId(value)
  return TERRITORIAL_COMARQUES.find((comarca) => comarca.id === id) || null
}

export function loadTerritorialComarca(storage = globalThis.localStorage) {
  try {
    return normalizeTerritorialComarcaId(
      storage?.getItem(TERRITORIAL_COMARCA_STORAGE_KEY),
    )
  } catch {
    return ''
  }
}

export function saveTerritorialComarca(
  value,
  storage = globalThis.localStorage,
) {
  const id = normalizeTerritorialComarcaId(value)
  try {
    if (id) {
      storage?.setItem(TERRITORIAL_COMARCA_STORAGE_KEY, id)
    } else {
      storage?.removeItem(TERRITORIAL_COMARCA_STORAGE_KEY)
    }
  } catch {
    // La vista continua funcionant encara que el navegador bloquegi l'emmagatzematge.
  }
  return id
}
