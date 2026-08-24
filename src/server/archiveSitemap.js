// Sitemap durador de l'hemeroteca: llista TOTES les peces publicades que viuen
// a D1 (no només les 50 llavor del sitemap.xml estàtic ni les últimes 48 h del
// news-sitemap). Es genera al vol al Worker (/sitemap-hemeroteca.xml) i el
// robots.txt l'anuncia, de manera que Google pot descobrir l'arxiu sencer.

import { feedStoryId } from '../lib/story-id.js'
import { readEditorialStoryCatalog } from './editorialStore.js'

const baseUrl = 'https://bondiari.com'

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function isoDay(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

// Construeix l'XML a partir d'una llista de peces. Exportat per als tests.
export function buildArchiveSitemap(stories) {
  const seen = new Set()
  const items = []
  for (const story of stories || []) {
    if (!story || !story.title || !story.url) continue
    const id = story.id || feedStoryId(story.url)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const loc = `${baseUrl}/noticia/${encodeURIComponent(id)}`
    const lastmod = isoDay(story.publishedAt)
    items.push(
      [
        '  <url>',
        `    <loc>${esc(loc)}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
        '    <changefreq>monthly</changefreq>',
        '    <priority>0.6</priority>',
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    if (items.length >= 5000) break // marge còmode sota el límit de 50.000
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...items,
    '</urlset>',
    '',
  ].join('\n')
}

export async function handleArchiveSitemap(env) {
  let stories = []
  try {
    const catalog = await readEditorialStoryCatalog(env, { limit: 5000 })
    stories = catalog?.stories || []
  } catch {
    stories = []
  }
  return new Response(buildArchiveSitemap(stories), {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=1800, stale-while-revalidate=3600',
    },
  })
}
