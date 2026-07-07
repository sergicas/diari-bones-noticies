// "Desa per llegir després": col·lecció d'articles desats al dispositiu.
// Guardem el contingut complet (títol, cos, impacte, font...) a localStorage
// perquè es puguin llegir SENSE connexió dins de l'app. És una funció
// exclusiva de l'app respecte del web obert.

const KEY = 'bondiari-saved-v1'
export const SAVED_EVENT = 'bondiari-saved-changed'

function read() {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // sense espai o localStorage no disponible
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SAVED_EVENT))
  }
}

// Ens quedem només amb el necessari per rellegir offline.
function slim(story) {
  return {
    id: story.id,
    title: story.title,
    summary: story.summary || '',
    impact: story.impact || '',
    body: Array.isArray(story.body) ? story.body : [],
    imageUrl: story.imageUrl || '',
    imageAlt: story.imageAlt || '',
    source: story.source || '',
    url: story.url || '',
    category: story.category || '',
    location: story.location || '',
    publishedAt: story.publishedAt || '',
    readTime: story.readTime || '',
    savedAt: new Date().toISOString(),
  }
}

export function getSaved() {
  return read().sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  )
}

export function isSaved(id) {
  return read().some((s) => s.id === id)
}

export function saveStory(story) {
  const list = read()
  if (list.some((s) => s.id === story.id)) return
  list.push(slim(story))
  write(list)
}

export function removeSaved(id) {
  write(read().filter((s) => s.id !== id))
}

// Alterna l'estat. Retorna true si ha quedat desat, false si s'ha tret.
export function toggleSaved(story) {
  if (isSaved(story.id)) {
    removeSaved(story.id)
    return false
  }
  saveStory(story)
  return true
}
