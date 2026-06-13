#!/usr/bin/env node
// Còpia de seguretat dels magatzems KV de bondiari.com.
// Exporta els subscriptors del butlletí i les estadístiques a un fitxer JSON
// local amb data, fent servir wrangler (només lectura). Útil perquè les dades
// de subscriptors no viuen enlloc més que a Cloudflare.
//
// Ús:  npm run backup
// Sortida: kv-backups/kv-backup-AAAA-MM-DD.json (carpeta gitignored: les
//          adreces dels subscriptors són dades personals i no han d'anar a git)

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const backupsDir = resolve(rootDir, 'kv-backups')

const namespaces = {
  STATS_KV: '08a529af25eb41eca09d26276cba77d2',
  LIVE_NEWS_KV: '8dccac0ffa434f75b13ba6a7890646af',
}

function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

// --remote és imprescindible: sense ell wrangler llegeix el KV local simulat
// (.wrangler/state), que és buit. Volem el magatzem de producció.
function listKeys(namespaceId) {
  const raw = wrangler(['kv', 'key', 'list', `--namespace-id=${namespaceId}`, '--remote'])
  return JSON.parse(raw).map((entry) => entry.name)
}

function getValue(namespaceId, key) {
  try {
    return wrangler(['kv', 'key', 'get', key, `--namespace-id=${namespaceId}`, '--remote'])
  } catch {
    return null
  }
}

function backupNamespace(namespaceId) {
  const keys = listKeys(namespaceId)
  const data = {}
  for (const key of keys) {
    const value = getValue(namespaceId, key)
    try {
      data[key] = value === null ? null : JSON.parse(value)
    } catch {
      data[key] = value // valor no-JSON (p.ex. un comptador en text pla)
    }
  }
  return { keyCount: keys.length, data }
}

function main() {
  const stampArg = process.argv[2] // permet passar la data per evitar Date dins de scripts deterministes
  const stamp = stampArg || new Date().toISOString().slice(0, 10)
  mkdirSync(backupsDir, { recursive: true })

  const backup = { exportedAt: new Date().toISOString(), namespaces: {} }
  for (const [name, id] of Object.entries(namespaces)) {
    console.log(`→ Exportant ${name} (${id}) ...`)
    backup.namespaces[name] = backupNamespace(id)
    console.log(`  ${backup.namespaces[name].keyCount} claus`)
  }

  // Resum de subscriptors per consola (sense exposar adreces senceres).
  const subs = Object.entries(backup.namespaces.STATS_KV?.data || {})
    .filter(([k]) => k.startsWith('subscriber:'))
    .map(([, v]) => v)
  const confirmed = subs.filter((s) => s?.status === 'confirmed' || s?.status === undefined).length
  const pending = subs.filter((s) => s?.status === 'pending').length
  console.log(`\nSubscriptors: ${subs.length} (${confirmed} confirmats, ${pending} pendents)`)

  const outPath = resolve(backupsDir, `kv-backup-${stamp}.json`)
  writeFileSync(outPath, JSON.stringify(backup, null, 2), 'utf8')
  console.log(`\n✓ Còpia desada a kv-backups/kv-backup-${stamp}.json`)
}

main()
