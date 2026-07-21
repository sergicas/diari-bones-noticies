// Comprovació editorial: cap article pot quedar sense imatge original.
// S'executa abans del build i pot llançar-se manualment amb `npm run check:articles`.

import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

import { validateArticleImage } from './lib/articleImageRules.mjs'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const articlesPath = resolve(rootDir, 'src/data/articles.js')

const { seedArticles } = await import(pathToFileURL(articlesPath).href)

if (!Array.isArray(seedArticles)) {
  console.error('No s’ha pogut llegir seedArticles des de', articlesPath)
  process.exit(1)
}

const results = seedArticles.map((article) => {
  const { errors, warnings, kind } = validateArticleImage(article)
  return {
    id: article.id,
    title: article.title,
    category: article.category,
    imageUrl: article.imageUrl,
    kind,
    errors,
    warnings,
  }
})

const grouped = {
  photo: results.filter((r) => r.kind === 'photo'),
  generated: results.filter((r) => r.kind === 'generated'),
  illustration: results.filter((r) => r.kind === 'illustration'),
  placeholder: results.filter((r) => r.kind === 'placeholder'),
  missing: results.filter((r) => r.kind === 'missing'),
  unknown: results.filter((r) => r.kind === 'unknown'),
}

function printGroup(title, items) {
  if (items.length === 0) return
  console.log(`\n${title} (${items.length})`)
  console.log('─'.repeat(title.length + items.length.toString().length + 3))
  for (const r of items) {
    const category = r.category ? `[${r.category}] ` : ''
    console.log(`  • ${category}${r.id}`)
    console.log(`      ${r.title || '(sense títol)'}`)
    console.log(`      ${r.imageUrl || '(sense imageUrl)'}`)
  }
}

const total = seedArticles.length
const okCount = results.filter((result) => result.errors.length === 0).length
const failingCount = total - okCount

console.log(`Total articles: ${total}`)
console.log(`Amb imatge original vàlida: ${okCount}`)
console.log(`Sense imatge original vàlida: ${failingCount}`)

printGroup('FOTOGRAFIA ORIGINAL', grouped.photo)
printGroup('IL·LUSTRACIÓ EDITORIAL PRÒPIA', grouped.generated)
printGroup('IL·LUSTRACIÓ INTERNA (cal substituir per foto real)', grouped.illustration)
printGroup('PLACEHOLDER', grouped.placeholder)
printGroup('IMAGEURL ABSENT', grouped.missing)
printGroup('FORMAT DESCONEGUT', grouped.unknown)

const totalWarnings = results.reduce((acc, r) => acc + r.warnings.length, 0)
if (totalWarnings > 0) {
  console.log(`\nAvisos d'imatge (credit/attribution absents): ${totalWarnings}`)
}

if (failingCount > 0) {
  console.error('')
  console.error(`La comprovació ha fallat: ${failingCount} article(s) sense imatge original vàlida.`)
  process.exit(1)
}
