// Ruta (relativa) de la il·lustració editorial pròpia d'una peça. Funció pura i
// sense dependències de servidor, perquè la puguin fer servir tant el Worker
// (liveNews, storyImage) com el bundle del navegador (articles de l'hemeroteca)
// sense arrossegar codi de servidor (IA, KV) al client.
//
// El "seed" porta la categoria i el títol perquè la ruta pugui construir el
// prompt sense consultar enlloc. Vegeu src/server/storyImage.js.
import { feedStoryId } from './story-id.js'

export function storyImagePath(url, { title, category } = {}) {
  const id = feedStoryId(url)
  const seed = `${category || ''}|${String(title || '').slice(0, 120)}`
  return `/api/story-image/${id}?s=${encodeURIComponent(seed)}`
}
