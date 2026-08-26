import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TERRITORIAL_COMARCA_STORAGE_KEY,
  loadTerritorialComarca,
  saveTerritorialComarca,
} from '../../lib/territorial.js'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('territorial client and privacy', () => {
  it('desa només un codi de comarca vàlid al storage proporcionat', () => {
    const values = new Map()
    const storage = {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    }
    expect(saveTerritorialComarca('21', storage)).toBe('21')
    expect(values.get(TERRITORIAL_COMARCA_STORAGE_KEY)).toBe('21')
    expect(loadTerritorialComarca(storage)).toBe('21')
    expect(saveTerritorialComarca('99', storage)).toBe('')
    expect(loadTerritorialComarca(storage)).toBe('')
  })

  it('la vista declara selector i estats accessibles sense geolocalització', () => {
    const source = readFileSync(join(rootDir, 'views', 'TerritorialView.jsx'), 'utf8')
    expect(source).toContain('htmlFor="territorial-comarca"')
    expect(source).toContain('aria-busy=')
    expect(source).toContain('role="status"')
    expect(source).toContain('role="alert"')
    expect(source).toContain('No hi ha resultats publicats')
    expect(source).not.toMatch(/navigator\.geolocation|request\.cf|ipapi/i)
  })

  it('el servei territorial queda fora del cron editorial', () => {
    const liveNews = readFileSync(join(rootDir, 'server', 'liveNews.js'), 'utf8')
    const feeds = readFileSync(
      join(rootDir, 'server', 'rss', 'feedsConfig.js'),
      'utf8',
    )
    expect(feeds).toMatch(/export const NOMES_FONTS_DEL_GIR = true/)
    expect(liveNews).not.toContain("from './territorial.js'")
    expect(liveNews).not.toContain('getTerritorialPayload(')
  })
})
