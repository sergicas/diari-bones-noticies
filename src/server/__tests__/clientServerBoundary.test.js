// Guarda de frontera client/servidor.
//
// vite.config.js exclou src/worker.js i src/server/ del bundle del client
// (és codi de Cloudflare Workers). Si una vista o component del navegador
// n'importa res, el chunk compilat queda apuntant a un fitxer que no
// existeix en producció i la vista mor amb "Failed to fetch dynamically
// imported module" (així es va trencar /diagnostic el juliol de 2026).
// Aquesta prova ho detecta abans de desplegar.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const clientDirs = ['views', 'components', 'lib']
const clientEntryFiles = ['App.jsx', 'main.jsx']

function listSourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(full)
    return /\.(js|jsx)$/.test(entry.name) ? [full] : []
  })
}

describe('Frontera client/servidor', () => {
  const files = [
    ...clientDirs.flatMap((dir) => listSourceFiles(join(rootDir, dir))),
    ...clientEntryFiles.map((name) => join(rootDir, name)),
  ]

  it('troba fitxers de client per revisar', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  for (const file of files) {
    it(`${file.slice(rootDir.length + 1)} no importa codi de src/server/`, () => {
      const source = readFileSync(file, 'utf8')
      const serverImport = source.match(
        /import[^'"]*['"][^'"]*(?:\/|^\.\.\/)server\/[^'"]*['"]/m,
      )
      expect(serverImport, serverImport ? serverImport[0] : undefined).toBeNull()
    })
  }
})
