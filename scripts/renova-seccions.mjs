#!/usr/bin/env node
// renova-seccions.mjs — Força la renovació diària de TOTES les seccions del
// diari i fa un informe de salut secció per secció.
//
// 1. Crida /api/refresh-news (força una passada nova de tots els feeds).
// 2. Llegeix el lot resultant i, per a cada secció editorial, compta quantes
//    notícies té i quina és la més fresca.
// 3. Marca en VERMELL les seccions seques (0 peces) o estancades (cap de < 24h),
//    perquè l'editor sàpiga on falta inflow.
//
// Ús: node scripts/renova-seccions.mjs   (o: npm run seccions)

const BASE = process.env.BONDIARI_URL || 'https://bondiari.sergicas.workers.dev'

// Seccions editorials de la portada i les categories que hi cauen (mirall de
// src/App.jsx → editorialSections).
const SECCIONS = [
  { nom: 'Política', cats: ['Política'] },
  { nom: 'Societat', cats: ['Societat', 'Comunitat'] },
  { nom: 'Cultura', cats: ['Cultura'] },
  { nom: 'Esports', cats: ['Esports'] },
  { nom: 'Món digital', cats: ['Tecnologia', 'Món digital', 'Ciència'] },
  { nom: 'Salut', cats: ['Salut'] },
  { nom: 'Medi ambient', cats: ['Medi ambient', 'Clima'] },
  { nom: 'Educació', cats: ['Educació'] },
  { nom: 'Solidaritat', cats: ['Solidaritat'] },
  { nom: 'Internacional', cats: ['Internacional', 'Món', 'Europa'] },
]

function hores(iso) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return Infinity
  return Math.round((Date.now() - t) / 3600000)
}

async function main() {
  console.log(`→ Forçant renovació de seccions (${new Date().toLocaleString('ca-ES', { timeZone: 'Europe/Madrid' })})`)

  // 1. Força el refresc complet de tots els feeds.
  try {
    const r = await fetch(`${BASE}/api/refresh-news`)
    const j = await r.json()
    console.log(`✓ Radar refrescat: ${j.count} notícies al lot.`)
  } catch (e) {
    console.error('✗ No s\'ha pogut refrescar el radar:', e.message)
    process.exit(1)
  }

  // 2. Llegeix el lot.
  const stories = (await (await fetch(`${BASE}/api/live-news`)).json()).stories || []

  // 3. Informe per secció.
  console.log('\n── Salut de les seccions ──')
  const seques = []
  for (const s of SECCIONS) {
    const peces = stories.filter((st) => s.cats.includes(st.category))
    const freshHores = peces.length ? Math.min(...peces.map((p) => hores(p.publishedAt))) : Infinity
    let estat
    if (peces.length === 0) { estat = '🔴 SECA (cap notícia)'; seques.push(s.nom) }
    else if (freshHores > 24) { estat = `🟠 estancada (la més nova fa ${freshHores}h)`; seques.push(s.nom) }
    else estat = `🟢 ${peces.length} peces · la més nova fa ${freshHores}h`
    console.log(`  ${s.nom.padEnd(14)} ${estat}`)
  }

  console.log('')
  if (seques.length === 0) {
    console.log('✅ Totes les seccions tenen notícies fresques.')
  } else {
    console.log(`⚠️  Seccions sense inflow fresc avui: ${seques.join(', ')}.`)
    console.log('   (Sovint és perquè avui no hi ha bones notícies d\'aquest tema; el filtre és estricte.)')
  }
}

main()
