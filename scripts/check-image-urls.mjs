// Fa una crida HEAD a cada imageUrl d'articles.js i reporta les que fallen.
// Ús: node scripts/check-image-urls.mjs

import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const articlesPath = resolve(rootDir, 'src/data/articles.js')
const { seedArticles } = await import(pathToFileURL(articlesPath).href)

const articles = seedArticles
  .filter((a) => /^https?:\/\//i.test(a.imageUrl))
  .map((a) => ({ id: a.id, imageUrl: a.imageUrl, category: a.category }))

console.log(`Comprovant ${articles.length} URLs externes...\n`)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'

async function probe(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        headers: {
          'user-agent': UA,
          accept: 'image/*,*/*;q=0.8',
          ...(method === 'GET' ? { range: 'bytes=0-1' } : {}),
        },
      })
      if (res.status >= 200 && res.status < 400) return { status: res.status }
      if (method === 'GET' || (res.status !== 405 && res.status < 500)) {
        return { status: res.status }
      }
    } catch (err) {
      if (method === 'GET') return { status: 'ERR', error: err.message }
    }
  }
  return { status: 'ERR' }
}

// Concurrència controlada (no 60 paral·leles, que provoquen race conditions)
const concurrency = 5
const results = []
let i = 0
async function worker() {
  while (i < articles.length) {
    const a = articles[i++]
    let result
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await probe(a.imageUrl)
      const ok = typeof result.status === 'number' && result.status >= 200 && result.status < 400
      if (ok) break
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
    const ok = typeof result.status === 'number' && result.status >= 200 && result.status < 400
    results.push({ ...a, ...result, ok })
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()))

const broken = results.filter((r) => !r.ok)
const ok = results.filter((r) => r.ok)

console.log(`✓ ${ok.length} URLs carreguen`)
console.log(`✗ ${broken.length} URLs trencades:\n`)

for (const b of broken) {
  console.log(`  [${b.category}] ${b.id}`)
  console.log(`    status: ${b.status}${b.error ? ` (${b.error})` : ''}`)
  console.log(`    url:    ${b.imageUrl}\n`)
}

if (broken.length > 0) process.exit(1)
