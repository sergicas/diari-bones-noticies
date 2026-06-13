// Id estable derivat de la URL de la peça del radar. La fan servir el front
// (App.jsx, en crear les targetes) i el Worker (per resoldre /noticia/:id i
// injectar els meta tags socials correctes). Determinista: la mateixa URL
// dona sempre el mateix id, així que tots dos costats coincideixen.
export function feedStoryId(url) {
  const source = String(url || '')
  let hash = 0
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) | 0
  }
  return `feed-${(hash >>> 0).toString(36)}`
}
