// Injecció de meta tags socials per a /noticia/:id.
// Quan un robot (WhatsApp, X, Telegram, Facebook...) o un lector demana una
// notícia concreta, servim el mateix index.html de la SPA però amb el <head>
// reescrit perquè el títol, la descripció i la imatge siguin els de la peça.
// Sense això, compartir una notícia mostrava sempre la targeta genèrica.

import { seedArticles } from '../data/articles.js'
import { feedStoryId } from '../lib/story-id.js'
import { findStoryInEditorialStore } from './editorialStore.js'
import { sanitizeStoryPhoto } from './storyPhoto.js'

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

// Busca la notícia que correspon a l'id de la ruta: primer al radar en viu
// (portada actual, KV 'latest'), després a la còpia persistida story:<id> (per a
// peces que ja han sortit de la portada, així els enllaços no fan 404) i, per
// últim, als articles editorials estàtics.
export async function findStory(id, env) {
  try {
    const cached = await env.LIVE_NEWS_KV.get('latest', 'json')
    const liveStory = (cached?.stories || []).find(
      (story) => feedStoryId(story.url) === id,
    )
    if (liveStory) return sanitizeStoryPhoto(liveStory)
    const stored = await env.LIVE_NEWS_KV.get(`story:${id}`, 'json')
    if (stored) return sanitizeStoryPhoto(stored)
  } catch {
    // Si el KV falla, encara podem mirar els editorials.
  }
  try {
    const durableStory = await findStoryInEditorialStore(env, id)
    if (durableStory) return sanitizeStoryPhoto(durableStory)
  } catch {
    // D1 és l'hemeroteca durable; KV continua sent la font de l'edició actual.
  }
  return seedArticles.find((story) => story.id === id) || null
}

function buildMeta(story) {
  const title = `${story.title} · ${siteName}`
  const description =
    (story.summary && story.summary.trim()) ||
    (story.impact && story.impact.trim()) ||
    `Una peça constructiva i verificable a ${siteName}.`
  const rawImage = (story.imageUrl && story.imageUrl.trim()) || defaultImage
  // La il·lustració es serveix des d'una ruta pròpia i relativa
  // (/api/story-image/...). Els robots de xarxes necessiten URL absoluta.
  const image = rawImage.startsWith('/') ? `${baseUrl}${rawImage}` : rawImage
  return { title, description, image }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const DATE_FMT = new Intl.DateTimeFormat('ca-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function formatDisplayDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return DATE_FMT.format(d)
}

// JSON-LD NewsArticle: perquè Google (News/Discover) entengui que és un article
// de diari — titular, data, imatge, secció i editor.
export function buildNewsArticleJsonLd(story, canonicalUrl) {
  const { description, image } = buildMeta(story)
  const published = story.publishedAt || undefined
  const data = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: story.title,
    description,
    image: image ? [image] : undefined,
    datePublished: published,
    dateModified: published,
    articleSection: story.category || undefined,
    inLanguage: story.language || 'ca',
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    author: { '@type': 'Organization', name: siteName, url: baseUrl },
    publisher: {
      '@type': 'Organization',
      name: siteName,
      url: baseUrl,
      logo: { '@type': 'ImageObject', url: `${baseUrl}/logo-colibri.png` },
    },
  }
  // Escapem '<' perquè el contingut JSON no pugui tancar el <script>.
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

// Contingut mínim de l'article DINS del HTML (titular + data + text), perquè
// Googlebot i qualsevol crawler sense JS el vegin abans que React hidrati. React
// (createRoot) reemplaça #root en carregar el JS, així que no es duplica.
export function buildArticleBodyHtml(story) {
  const parts = ['<article>']
  if (story.kicker) parts.push(`<p>${escapeHtml(story.kicker)}</p>`)
  parts.push(`<h1>${escapeHtml(story.title)}</h1>`)
  if (story.publishedAt) {
    parts.push(
      `<time datetime="${escapeAttr(story.publishedAt)}">${escapeHtml(formatDisplayDate(story.publishedAt))}</time>`,
    )
  }
  const summary =
    (story.summary && story.summary.trim()) ||
    (story.impact && story.impact.trim()) ||
    ''
  if (summary) parts.push(`<p>${escapeHtml(summary)}</p>`)
  for (const paragraph of Array.isArray(story.body) ? story.body : []) {
    if (paragraph && paragraph.trim()) parts.push(`<p>${escapeHtml(paragraph)}</p>`)
  }
  if (story.source) {
    const src = story.url
      ? `<a href="${escapeAttr(story.url)}" rel="noopener nofollow">${escapeHtml(story.source)}</a>`
      : escapeHtml(story.source)
    parts.push(`<p>Font: ${src}</p>`)
  }
  parts.push('</article>')
  return parts.join('')
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
    [/<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i, '<meta property="og:type" content="article" />'],
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

  // Senyals d'article + dades estructurades (NewsArticle) abans de </head>.
  const published = escapeAttr(story.publishedAt || '')
  const section = escapeAttr(story.category || '')
  const headExtras = [
    published && `<meta property="article:published_time" content="${published}" />`,
    published && `<meta property="article:modified_time" content="${published}" />`,
    section && `<meta property="article:section" content="${section}" />`,
    `<meta property="article:author" content="${escapeAttr(siteName)}" />`,
    `<script type="application/ld+json">${buildNewsArticleJsonLd(story, requestUrl)}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ')
  if (result.includes('</head>')) {
    result = result.replace('</head>', `    ${headExtras}\n  </head>`)
  }

  // Titular + data + text dins de #root perquè els crawlers vegin contingut.
  result = result.replace(
    /<div id="root">\s*<\/div>/i,
    `<div id="root">${buildArticleBodyHtml(story)}</div>`,
  )
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
