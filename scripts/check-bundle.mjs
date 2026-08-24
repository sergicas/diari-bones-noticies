import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(rootDir, 'dist')
const assetsDir = resolve(distDir, 'assets')
const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf8')
const mainScriptMatch = indexHtml.match(
  /<script[^>]+src="\/assets\/(index-[^"]+\.js)"/,
)

if (!mainScriptMatch) {
  throw new Error('No s’ha pogut identificar el JavaScript principal del build.')
}

const mainScriptName = mainScriptMatch[1]
const mainScript = readFileSync(resolve(assetsDir, mainScriptName))
const mainGzipBytes = gzipSync(mainScript).byteLength
const mainBudgetBytes = 90 * 1024

if (mainGzipBytes > mainBudgetBytes) {
  throw new Error(
    `El paquet principal ocupa ${(mainGzipBytes / 1024).toFixed(2)} KiB gzip i supera el pressupost de 90 KiB.`,
  )
}

const assetNames = readdirSync(assetsDir)
const lazyChunkPrefixes = [
  'articles-',
  'ArchiveView-',
  'TopicsView-',
  'TopicPageView-',
  'SavedView-',
  'StatsView-',
  'PrivacyView-',
  'ManifestView-',
  'AboutView-',
  'DiagnosticView-',
]

for (const prefix of lazyChunkPrefixes) {
  const chunkName = assetNames.find((name) => name.startsWith(prefix))
  if (!chunkName) {
    throw new Error(`Falta el chunk diferit esperat: ${prefix}*.js`)
  }
  if (indexHtml.includes(chunkName)) {
    throw new Error(`El chunk diferit ${chunkName} ha tornat a la ruta inicial.`)
  }
}

console.log(
  `Pressupost web correcte: ${mainScriptName} ocupa ${(mainGzipBytes / 1024).toFixed(2)} KiB gzip (màxim 90 KiB).`,
)
