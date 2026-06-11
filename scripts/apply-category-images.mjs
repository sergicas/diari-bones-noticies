import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const articlesPath = resolve(rootDir, 'src/data/articles.js')

const categorySlug = {
  Política: 'politica',
  Societat: 'societat',
  Cultura: 'cultura',
  Esports: 'esports',
  'Món digital': 'mon-digital',
  Salut: 'salut',
  'Medi ambient': 'medi-ambient',
  Clima: 'clima',
  Ciència: 'ciencia',
  Educació: 'educacio',
  Solidaritat: 'solidaritat',
  Internacional: 'internacional',
}

let content = await readFile(articlesPath, 'utf-8')

// Parse: cerca cada bloc { ... } amb un id i una category, i si imageUrl és default-news.svg, el substitueix.
const objectPattern = /\{[^{}]*?id:\s*['"][^'"]+['"][\s\S]*?\}(?=,\s*\{|,\s*\])/g
let replaced = 0
let skipped = 0
let unknown = []

content = content.replace(objectPattern, (block) => {
  const catMatch = block.match(/category:\s*['"]([^'"]+)['"]/)
  if (!catMatch) return block
  const category = catMatch[1]
  const slug = categorySlug[category]
  if (!slug) {
    unknown.push(category)
    return block
  }
  if (!/\/story-images\/default-news\.svg/.test(block)) {
    skipped++
    return block
  }
  const updated = block.replace(
    /imageUrl:\s*(['"])\/story-images\/default-news\.svg\1/,
    (m, quote) => `imageUrl: ${quote}/story-images/categories/${slug}.svg${quote}`,
  )
  if (updated !== block) replaced++
  return updated
})

await writeFile(articlesPath, content, 'utf-8')

console.log(`Aplicats: ${replaced}`)
console.log(`Saltats (no tenien default): ${skipped}`)
if (unknown.length) console.warn(`Categories no mapejades:`, [...new Set(unknown)])
