import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const articlesPath = resolve(rootDir, 'src/data/articles.js')
const bodiesPath = resolve(rootDir, 'scripts/expanded-bodies.json')

const articles = await readFile(articlesPath, 'utf-8')
const bodiesJson = JSON.parse(await readFile(bodiesPath, 'utf-8'))

function serializeParagraph(paragraph) {
  // Usa cometes dobles per envoltar la cadena (segur amb apòstrofs tipogràfics ’)
  const escaped = paragraph
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
  return `      "${escaped}",`
}

function buildBodyArray(paragraphs) {
  return ['    body: [', ...paragraphs.map(serializeParagraph), '    ],'].join(
    '\n',
  )
}

let result = articles
let applied = 0
let skipped = 0

for (const [id, paragraphs] of Object.entries(bodiesJson)) {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    console.warn(`[skip] ${id}: no és un array vàlid`)
    skipped++
    continue
  }
  if (paragraphs.length === 1 && paragraphs[0] === 'SKIP') {
    console.log(`[skip] ${id}: marcat com a SKIP per l'agent`)
    skipped++
    continue
  }

  // Localitza el bloc de l'article per id i el seu body
  const idPattern = new RegExp(
    `(\\n\\s*id:\\s*'${id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}',[\\s\\S]*?)body:\\s*\\[[\\s\\S]*?\\],`,
    'm',
  )
  const match = result.match(idPattern)
  if (!match) {
    console.warn(`[miss] ${id}: no s’ha trobat el bloc al fitxer`)
    skipped++
    continue
  }

  const newBody = buildBodyArray(paragraphs)
  result = result.replace(idPattern, `${match[1]}${newBody}`)
  applied++
}

await writeFile(articlesPath, result, 'utf-8')

console.log(`\nFet: ${applied} aplicats, ${skipped} no aplicats`)
