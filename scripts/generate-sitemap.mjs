import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { seedArticles as rawSeedArticles } from '../src/data/articles.js'
import { hasOriginalPhoto } from '../src/lib/imageRules.js'

// Aplica la regla editorial: només inclou articles amb fotografia original al
// sitemap i al feed RSS. Els que tenen il·lustració queden ocultats també
// dels metadades públiques.
const seedArticles = rawSeedArticles.filter(hasOriginalPhoto)
const droppedCount = rawSeedArticles.length - seedArticles.length
if (droppedCount > 0) {
  console.log(
    `[sitemap] ${droppedCount} article(s) sense fotografia original descartats del sitemap i del feed.`,
  )
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = resolve(rootDir, 'public')
const distDir = resolve(rootDir, 'dist')
const baseUrl = 'https://bondiari.com'
const siteName = 'El Bon Diari'
const defaultDescription =
  'Diari constructiu en català amb bones notícies verificables, organitzades per proximitat i secció.'
const defaultImage = `${baseUrl}/og-image.png`

const staticPages = [
  {
    path: '/',
    title: `${siteName} | Bones notícies`,
    description: defaultDescription,
    priority: '1.0',
    changefreq: 'daily',
  },
  {
    path: '/manifest',
    title: `Manifest | ${siteName}`,
    description:
      "La línia editorial d'El Bon Diari: criteri, utilitat i periodisme constructiu.",
    priority: '0.5',
    changefreq: 'monthly',
  },
  {
    path: '/hemeroteca',
    title: `Hemeroteca | ${siteName}`,
    description:
      "La Hemeroteca d'El Bon Diari conserva les bones notícies que ja han passat per portada.",
    priority: '0.7',
    changefreq: 'daily',
  },
  {
    path: '/sobre',
    title: `Sobre · ${siteName}`,
    description:
      "Qui hi ha darrere d'El Bon Diari, criteri editorial, política de privacitat i llicència del contingut.",
    priority: '0.6',
    changefreq: 'yearly',
  },
  {
    path: '/privacitat',
    title: `Política de privacitat · ${siteName}`,
    description:
      "Política de privacitat d'El Bon Diari: quines dades es recullen al web i a l'app, notificacions push, butlletí i els teus drets.",
    priority: '0.4',
    changefreq: 'yearly',
  },
]

const hiddenPages = [
  {
    path: '/estadistiques',
    title: `Estadístiques | ${siteName}`,
    description:
      "Panell d'estadístiques d'El Bon Diari: visites, pàgines més llegides i orígens.",
    noindex: true,
  },
]

function isoDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return defaultImage
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return `${baseUrl}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`
}

function storyPath(story) {
  return `/noticia/${encodeURIComponent(story.id)}`
}

function storyUrl(story) {
  return `${baseUrl}${storyPath(story)}`
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n')
}

function rssItem(story) {
  const url = storyUrl(story)
  const description = `${story.summary}\n\nImpacte: ${story.impact}\nFont: ${story.source}`

  return [
    '    <item>',
    `      <title>${escapeXml(story.title)}</title>`,
    `      <link>${escapeXml(url)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
    `      <description>${escapeXml(description)}</description>`,
    `      <pubDate>${new Date(story.publishedAt).toUTCString()}</pubDate>`,
    `      <category>${escapeXml(story.category)}</category>`,
    '    </item>',
  ].join('\n')
}

function replaceTag(html, pattern, replacement) {
  return pattern.test(html)
    ? html.replace(pattern, replacement)
    : html.replace('</head>', `    ${replacement}\n  </head>`)
}

function upsertHeadMeta(html, page) {
  const canonical = `${baseUrl}${page.path}`
  const title = escapeHtml(page.title)
  const description = escapeHtml(page.description)
  const image = escapeHtml(page.image || defaultImage)
  const type = page.type || 'website'

  let nextHtml = html
  nextHtml = replaceTag(nextHtml, /<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${description}" />`,
  )
  nextHtml = replaceTag(
    nextHtml,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${canonical}" />`,
  )
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:type" content="${type}" />`,
  )
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${title}" />`,
  )
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${description}" />`,
  )
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${canonical}" />`,
  )
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:image" content="${image}" />`,
  )
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${title}" />`,
  )
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${description}" />`,
  )
  nextHtml = replaceTag(
    nextHtml,
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:image" content="${image}" />`,
  )

  if (page.noindex) {
    nextHtml = nextHtml.replace(
      '</head>',
      '    <meta name="robots" content="noindex, nofollow" />\n  </head>',
    )
  }

  if (page.jsonLd) {
    nextHtml = nextHtml.replace(
      '</head>',
      `    <script type="application/ld+json">${JSON.stringify(page.jsonLd)}</script>\n  </head>`,
    )
  }

  return nextHtml
}

async function writeBoth(relativePath, content) {
  for (const baseDir of [publicDir, distDir]) {
    if (!existsSync(baseDir)) continue
    const target = resolve(baseDir, relativePath)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf-8')
  }
}

async function writeRouteHtml(page, indexHtml) {
  if (!existsSync(distDir)) return
  const outputPath =
    page.path === '/'
      ? resolve(distDir, 'index.html')
      : resolve(distDir, page.path.replace(/^\//, ''), 'index.html')
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, upsertHeadMeta(indexHtml, page), 'utf-8')
}

const today = isoDate()

const sitemapEntries = []
for (const page of staticPages) {
  sitemapEntries.push(
    urlEntry({
      loc: `${baseUrl}${page.path}`,
      lastmod: today,
      changefreq: page.changefreq,
      priority: page.priority,
    }),
  )
}

for (const story of seedArticles) {
  sitemapEntries.push(
    urlEntry({
      loc: storyUrl(story),
      lastmod: isoDate(story.publishedAt),
      changefreq: 'monthly',
      priority: story.featured ? '0.9' : '0.7',
    }),
  )
}

const sitemapXml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...sitemapEntries,
  '</urlset>',
  '',
].join('\n')

const sortedStories = [...seedArticles].sort(
  (left, right) =>
    new Date(right.publishedAt).getTime() -
    new Date(left.publishedAt).getTime(),
)

const feedXml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
  '  <channel>',
  `    <title>${escapeXml(siteName)}</title>`,
  `    <link>${baseUrl}/</link>`,
  `    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml" />`,
  `    <description>${escapeXml(defaultDescription)}</description>`,
  '    <language>ca</language>',
  `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
  ...sortedStories.slice(0, 60).map(rssItem),
  '  </channel>',
  '</rss>',
  '',
].join('\n')

await writeBoth('sitemap.xml', sitemapXml)
await writeBoth('feed.xml', feedXml)

if (existsSync(resolve(distDir, 'index.html'))) {
  const indexHtml = await readFile(resolve(distDir, 'index.html'), 'utf-8')
  const routePages = [
    ...staticPages,
    ...hiddenPages,
    ...seedArticles.map((story) => ({
      path: storyPath(story),
      title: `${story.title} | ${siteName}`,
      description: story.summary,
      image: absoluteUrl(story.imageUrl),
      type: 'article',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: story.title,
        description: story.summary,
        datePublished: story.publishedAt,
        dateModified: story.publishedAt,
        image: [absoluteUrl(story.imageUrl)],
        author: {
          '@type': 'Organization',
          name: siteName,
          url: baseUrl,
        },
        publisher: {
          '@type': 'Organization',
          name: siteName,
          logo: {
            '@type': 'ImageObject',
            url: `${baseUrl}/logo-colibri.png?v=4`,
          },
        },
        mainEntityOfPage: storyUrl(story),
        isBasedOn: story.url,
      },
    })),
  ]

  for (const page of routePages) {
    await writeRouteHtml(page, indexHtml)
  }

  console.log(`HTML estàtic generat per a ${routePages.length} rutes → dist/`)
}

console.log(`sitemap.xml generat amb ${sitemapEntries.length} URLs`)
console.log(`feed.xml generat amb ${Math.min(sortedStories.length, 30)} notícies`)
