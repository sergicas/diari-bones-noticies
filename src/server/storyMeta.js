// Injecció de meta tags socials per a /noticia/:id.
// Quan un robot (WhatsApp, X, Telegram, Facebook...) o un lector demana una
// notícia concreta, servim el mateix index.html de la SPA però amb el <head>
// reescrit perquè el títol, la descripció i la imatge siguin els de la peça.
// Sense això, compartir una notícia mostrava sempre la targeta genèrica.

import { seedArticles } from '../data/articles.js'
import { feedStoryId } from '../lib/story-id.js'

const baseUrl = 'https://bondiari.com'
const siteName = 'El Bon Diari'
const defaultImage = `${baseUrl}/og-image.png`

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function decodeId(rawId) {
  try {
    return decodeURIComponent(rawId)
  } catch {
    return rawId
  }
}

// Busca la notícia que correspon a l'id de la ruta, primer al radar en viu
// (KV) i després als articles editorials estàtics.
async function findStory(id, env) {
  try {
    const cached = await env.LIVE_NEWS_KV.get('latest', 'json')
    const liveStory = (cached?.stories || []).find(
      (story) => feedStoryId(story.url) === id,
    )
    if (liveStory) return liveStory
  } catch {
    // Si el KV falla, encara podem mirar els editorials.
  }
  return seedArticles.find((story) => story.id === id) || null
}

function buildMeta(story) {
  const title = `${story.title} · ${siteName}`
  const description =
    (story.summary && story.summary.trim()) ||
    (story.impact && story.impact.trim()) ||
    `Una bona notícia verificable a ${siteName}.`
  const image = (story.imageUrl && story.imageUrl.trim()) || defaultImage
  return { title, description, image }
}

// Reescriu (o crea) les capçaleres del <head> que afecten la compartició.
function injectStoryMeta(html, story, requestUrl) {
  const { title, description, image } = buildMeta(story)
  const t = escapeAttr(title)
  const d = escapeAttr(description)
  const img = escapeAttr(image)
  const canonical = escapeAttr(requestUrl)

  const replacements = [
    [/<title>[\s\S]*?<\/title>/i, `<title>${t}</title>`],
    [/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${t}" />`],
    [/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${d}" />`],
    [/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${img}" />`],
    [/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${canonical}" />`],
    [/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${d}" />`],
    [/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${t}" />`],
    [/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${d}" />`],
    [/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${img}" />`],
    [/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${canonical}" />`],
  ]

  let result = html
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(result)) {
      result = result.replace(pattern, replacement)
    }
  }
  return result
}

// Retorna una Response amb el HTML personalitzat, o null si no s'ha trobat la
// notícia (llavors el caller fa el fallback SPA normal).
export async function renderStoryPage(request, env) {
  const url = new URL(request.url)
  const match = url.pathname.match(/^\/noticia\/([^/]+)\/?$/)
  if (!match) return null

  const id = decodeId(match[1])
  const story = await findStory(id, env)
  if (!story) return null

  const assetResponse = await env.ASSETS.fetch(new Request(`${url.origin}/`, request))
  if (!assetResponse.ok) return null
  const html = await assetResponse.text()
  const personalized = injectStoryMeta(html, story, `${baseUrl}${url.pathname}`)

  return new Response(personalized, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  })
}

export { injectStoryMeta, buildMeta }
