// Ruta (relativa) de la il·lustració editorial pròpia d'una peça. Funció pura i
// sense dependències de servidor, perquè la puguin fer servir tant el Worker
// (liveNews, storyImage) com el bundle del navegador (articles de l'hemeroteca)
// sense arrossegar codi de servidor (IA, KV) al client.
//
// El "seed" porta la categoria i el títol perquè la ruta pugui construir el
// prompt sense consultar enlloc. Vegeu src/server/storyImage.js.
import { feedStoryId } from './story-id.js'

// Preferim un "brief" visual concret per a la notícia (una escena en anglès que
// descriu la peça: "a modern tram on a tree-lined avenue"). Si no n'hi ha (peça
// antiga, IA caiguda, hemeroteca estàtica), caiem al format llegat categoria|títol
// i la ruta hi aplica el motiu de secció. La ruta distingeix els dos casos pel "|".
export function storyImagePath(url, { title, category, brief } = {}) {
  const id = feedStoryId(url)
  const clean = String(brief || '').replace(/\|/g, ' ').trim()
  const seed = clean
    ? clean.slice(0, 200)
    : `${category || ''}|${String(title || '').slice(0, 120)}`
  return `/api/story-image/${id}?s=${encodeURIComponent(seed)}`
}
