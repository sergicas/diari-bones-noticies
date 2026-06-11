// Aplica un lot de correccions d'imatge a src/data/articles.js.
// Llegeix un JSON amb [{ id, imageUrl, imageAlt, imageCredit }] i actualitza els
// camps imageUrl, imageAlt, imageCredit i imageAttributionUrl (de article.url).

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const articlesPath = resolve(rootDir, 'src/data/articles.js')

const fixesPath = process.argv[2]
if (!fixesPath) {
  console.error('Ús: node scripts/apply-image-fixes.mjs <fitxer-fixes.json>')
  process.exit(1)
}

const fixes = JSON.parse(await readFile(fixesPath, 'utf-8'))
const { seedArticles } = await import(pathToFileURL(articlesPath).href)

const articlesById = new Map(seedArticles.map((a) => [a.id, a]))

let src = await readFile(articlesPath, 'utf-8')
let updated = 0
const notFound = []

function escapeJs(value) {
  return JSON.stringify(String(value))
}

function replaceFieldInBlock(blockText, field, newValue) {
  // Regex robust: detecta el tipus de cometa d'obertura (' o ") i busca la mateixa
  // cometa com a tancament, ignorant les escapades i les del tipus contrari (apòstrofs
  // catalans dins de cometes dobles). Hauria de ser unicode-aware via 'u'.
  const regex = new RegExp(
    `(\\b${field}:\\s*\\n?\\s*)(["'])((?:\\\\.|(?!\\2)[\\s\\S])*?)\\2(,?)`,
    'm',
  )
  if (!regex.test(blockText)) return blockText
  return blockText.replace(regex, (_, prefix, _q, _inner, comma) => {
    return `${prefix}${escapeJs(newValue)}${comma}`
  })
}

function findArticleBlock(text, id) {
  const idMarker = `id: '${id}'`
  const altMarker = `id: "${id}"`
  let start = text.indexOf(idMarker)
  if (start < 0) start = text.indexOf(altMarker)
  if (start < 0) return null
  let openBrace = text.lastIndexOf('{', start)
  if (openBrace < 0) return null
  let depth = 1
  let i = openBrace + 1
  while (i < text.length && depth > 0) {
    const ch = text[i]
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    i += 1
  }
  if (depth !== 0) return null
  return { start: openBrace, end: i }
}

for (const fix of fixes) {
  const original = articlesById.get(fix.id)
  if (!original) {
    notFound.push(fix.id)
    continue
  }
  const block = findArticleBlock(src, fix.id)
  if (!block) {
    notFound.push(fix.id)
    continue
  }
  let chunk = src.slice(block.start, block.end)
  chunk = replaceFieldInBlock(chunk, 'imageUrl', fix.imageUrl)
  chunk = replaceFieldInBlock(chunk, 'imageAlt', fix.imageAlt)
  if (fix.imageCredit) {
    chunk = replaceFieldInBlock(chunk, 'imageCredit', fix.imageCredit)
  }
  if (original.url) {
    chunk = replaceFieldInBlock(chunk, 'imageAttributionUrl', original.url)
  }
  src = src.slice(0, block.start) + chunk + src.slice(block.end)
  updated += 1
}

if (notFound.length) {
  console.error('No trobats:', notFound)
}

await writeFile(articlesPath, src, 'utf-8')
console.log(`Articles actualitzats: ${updated}/${fixes.length}`)
