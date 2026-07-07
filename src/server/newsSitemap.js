// Sitemap de Google News amb les peces vives del radar (KV).
// Els news sitemaps només han de contenir articles de les últimes 48 h, cosa
// que encaixa perfectament amb el radar en viu. La ruta /news-sitemap.xml del
// Worker el genera al vol i el robots.txt l'anuncia.

import { feedStoryId } from '../lib/story-id.js'

const baseUrl = 'https://bondiari.com'
const publicationName = 'El Bon Diari'
const NEWS_MAX_AGE_MS = 48 * 60 * 60 * 1000

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Construeix l'XML del sitemap de notícies a partir d'una llista de peces.
// `now` és injectable per als tests.
export function buildNewsSitemap(stories, now = Date.now()) {
  const items = (stories || [])
    .filter((s) => s && s.title && s.url && s.publishedAt)
    .filter((s) => {
      const t = new Date(s.publishedAt).getTime()
      return !Number.isNaN(t) && now - t <= NEWS_MAX_AGE_MS
    })
    .slice(0, 1000) // límit de Google per a news sitemaps
    .map((s) => {
      const loc = `${baseUrl}/noticia/${encodeURIComponent(feedStoryId(s.url))}`
      const lang = (s.language || 'ca').slice(0, 2)
      return [
        '  <url>',
        `    <loc>${esc(loc)}</loc>`,
        '    <news:news>',
        '      <news:publication>',
        `        <news:name>${esc(publicationName)}</news:name>`,
        `        <news:language>${esc(lang)}</news:language>`,
        '      </news:publication>',
        `      <news:publication_date>${esc(new Date(s.publishedAt).toISOString())}</news:publication_date>`,
        `      <news:title>${esc(s.title)}</news:title>`,
        '    </news:news>',
        '  </url>',
      ].join('\n')
    })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
    ...items,
    '</urlset>',
    '',
  ].join('\n')
}

export async function handleNewsSitemap(env) {
  let stories = []
  try {
    const cached = await env.LIVE_NEWS_KV.get('latest', 'json')
    stories = cached?.stories || []
  } catch {
    stories = []
  }
  return new Response(buildNewsSitemap(stories), {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=600, stale-while-revalidate=3600',
    },
  })
}
