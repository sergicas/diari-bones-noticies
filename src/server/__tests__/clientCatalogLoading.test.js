import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const appSource = readFileSync(join(rootDir, 'App.jsx'), 'utf8')

describe('càrrega del catàleg editorial al client', () => {
  it('no inicia el chunk gran d’articles durant l’avaluació del mòdul', () => {
    expect(appSource).not.toMatch(
      /const\s+seedArticlesPromise\s*=\s*import\(['"]\.\/data\/articles\.js['"]\)/,
    )
    expect(appSource).toContain('function loadSeedArticles()')
  })

  it('precàrrega el catàleg en idle i el manté com a fallback de l’hemeroteca', () => {
    expect(appSource).toContain('const deferredSeedLoadMs = 4000')
    expect(appSource).toContain('window.requestIdleCallback(hydrateSeedCatalog')
    expect(appSource).toContain("if (route.page === 'story')")
    expect(appSource).toMatch(
      /No s’ha pogut carregar l’hemeroteca permanent[\s\S]*?loadSeedArticles\(\)/,
    )
  })

  it('el radar i els refrescos no esperen el chunk editorial', () => {
    const updateFromRadar = appSource.match(
      /async function updateFromRadar\(\)\s*{[\s\S]*?updateFromRadar\(\)/,
    )?.[0]
    const refreshRadar = appSource.match(
      /async function refreshRadar\(\)\s*{[\s\S]*?\n {2}\}/,
    )?.[0]
    const handleRefresh = appSource.match(
      /async function handleRefresh\(\)\s*{[\s\S]*?\n {2}\}/,
    )?.[0]

    for (const block of [updateFromRadar, refreshRadar, handleRefresh]) {
      expect(block).toContain('await fetchLivePositiveNewsPayload()')
      expect(block).not.toContain('seedArticlesPromise')
    }
  })
})
