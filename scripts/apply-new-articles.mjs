import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  validateArticleImage,
  formatValidationReport,
} from './lib/articleImageRules.mjs'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const articlesPath = resolve(rootDir, 'src/data/articles.js')
const argFiles = process.argv.slice(2)
const sourceFiles = argFiles.length > 0
  ? argFiles.map((f) => resolve(rootDir, f))
  : [
      resolve(rootDir, 'scripts/new-articles-catalan.json'),
      resolve(rootDir, 'scripts/new-articles-international.json'),
      resolve(rootDir, 'scripts/new-articles-positive.json'),
    ]

const fieldOrder = [
  'id',
  'title',
  'category',
  'location',
  'summary',
  'impact',
  'source',
  'url',
  'imageUrl',
  'imageAlt',
  'imageCredit',
  'imageAttributionUrl',
  'readTime',
  'publishedAt',
  'featured',
  'origin',
  'kicker',
  'body',
]

function jsString(value) {
  // Serialitza usant cometes dobles, escapa nomes el necessari
  return JSON.stringify(String(value))
}

function jsValue(value) {
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    const items = value.map((item) => `      ${jsString(item)},`).join('\n')
    return `[\n${items}\n    ]`
  }
  return jsString(value)
}

function serializeArticle(article) {
  const lines = ['  {']
  for (const field of fieldOrder) {
    if (!(field in article)) continue
    const value = jsValue(article[field])
    if (typeof article[field] === 'string' && article[field].length > 60) {
      // multi-line per a strings llargs
      lines.push(`    ${field}:`)
      lines.push(`      ${jsString(article[field])},`)
    } else {
      lines.push(`    ${field}: ${value},`)
    }
  }
  lines.push('  },')
  return lines.join('\n')
}

const allArticles = []
for (const file of sourceFiles) {
  const items = JSON.parse(await readFile(file, 'utf-8'))
  allArticles.push(...items)
}

console.log(`Llegits ${allArticles.length} articles de ${sourceFiles.length} fitxers`)

// Cada article ha de portar imatge real (regla editorial: cap notícia sense imatge).
const imageResults = allArticles.map((article) => {
  const { errors, warnings } = validateArticleImage(article)
  return { id: article.id, title: article.title, errors, warnings }
})
const imageReport = formatValidationReport(imageResults)
if (imageReport.totalErrors > 0) {
  console.error(imageReport.text)
  console.error('')
  console.error(
    `S'han trobat ${imageReport.totalErrors} article(s) sense imatge vàlida. Apliqueu imatge abans de tornar a executar el script.`,
  )
  process.exit(1)
}
if (imageReport.totalWarnings > 0) {
  console.warn(imageReport.text)
  console.warn('')
  console.warn(`Avisos d'imatge: ${imageReport.totalWarnings} (no bloquen l'apply).`)
}

// Verifica IDs únics dins el nou lot
const ids = new Set()
const dups = []
for (const a of allArticles) {
  if (ids.has(a.id)) dups.push(a.id)
  ids.add(a.id)
}
if (dups.length) {
  console.error('DUPLICATS:', dups)
  process.exit(1)
}

const articlesJs = await readFile(articlesPath, 'utf-8')

// Verifica que cap id ja existeix
const existing = [...articlesJs.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1])
const collisions = allArticles.filter((a) => existing.includes(a.id))
if (collisions.length) {
  console.error('COL·LISIONS amb existents:', collisions.map((a) => a.id))
  process.exit(1)
}

const newBlocks = allArticles.map(serializeArticle).join('\n')

// Insereix abans del tancament de l'array (el ']' final)
const updated = articlesJs.replace(/\n\]\s*$/, `\n${newBlocks}\n]\n`)

if (updated === articlesJs) {
  console.error('No s’ha trobat el patró de tancament a articles.js')
  process.exit(1)
}

await writeFile(articlesPath, updated, 'utf-8')
console.log(`Afegits ${allArticles.length} articles a articles.js`)
