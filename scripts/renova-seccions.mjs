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
const REFRESH_TOKEN = process.env.BONDIARI_REFRESH_TOKEN

// Seccions editorials de la portada i les categories que hi cauen (mirall de
// src/App.jsx → editorialSections).
const SECCIONS = [
  { nom: 'Local', cats: ['Local'] },
  { nom: 'Política', cats: ['Política'] },
  { nom: 'Societat', cats: ['Societat', 'Comunitat'] },
  { nom: 'Cultura', cats: ['Cultura'] },
  { nom: 'Esports', cats: ['Esports'] },
  { nom: 'Economia', cats: ['Economia'] },
  { nom: 'Món digital', cats: ['Tecnologia', 'Món digital'] },
  { nom: 'Ciència', cats: ['Ciència', 'Coneixement'] },
  { nom: 'Gastronomia', cats: ['Gastronomia'] },
  { nom: 'Habitatge i ciutat', cats: ['Habitatge', 'Urbanisme'] },
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
  if (!REFRESH_TOKEN) {
    console.error('✗ Falta BONDIARI_REFRESH_TOKEN a l’entorn.')
    process.exit(1)
  }
  console.log(`→ Forçant renovació de seccions (${new Date().toLocaleString('ca-ES', { timeZone: 'Europe/Madrid' })})`)

  // 1. Força el refresc complet de tots els feeds.
  //
  // Des del 14-08-2026 l'endpoint ENCUA la feina i respon 202. Abans, aquest
  // script donava el refresc per fet a l'instant i tot seguit llegia el lot
  // VELL: l'informe de salut de les seccions sortia amb dades d'abans.
  const llegeixLot = async () => {
    const r = await fetch(`${BASE}/api/live-news`, {
      headers: { 'cache-control': 'no-cache' },
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  }
  // Se sondeja la FEINA encuada, no la data del lot: una feina aliena que
  // acabi primer canviaria la data i faria creure que ha acabat la nostra, i
  // una de pròpia que acabi sense novetats no la canviaria i faria creure que
  // no ha acabat.
  const ESPERA_MAXIMA_MS = 3 * 60 * 1000
  let lot
  let resultat = null
  try {
    const r = await fetch(`${BASE}/api/refresh-news`, {
      method: 'POST',
      headers: { authorization: `Bearer ${REFRESH_TOKEN}` },
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j = await r.json()
    if (j.queued) {
      const limit = Date.now() + ESPERA_MAXIMA_MS
      let acabada = false
      while (Date.now() < limit && !acabada) {
        await new Promise((res) => setTimeout(res, 3000))
        const e = await fetch(j.statusUrl, {
          headers: { authorization: `Bearer ${REFRESH_TOKEN}` },
        })
        if (!e.ok) throw new Error(`estat HTTP ${e.status}`)
        const feina = await e.json()
        if (feina.status === 'completed') {
          acabada = true
          resultat = feina.result || null
        } else if (feina.status === 'failed') {
          throw new Error(`la feina ha fallat: ${feina.error || 'sense detall'}`)
        }
      }
      if (!acabada) {
        throw new Error(
          `el radar no ha acabat en ${ESPERA_MAXIMA_MS / 1000} s (la feina pot seguir a la cua)`,
        )
      }
    }
    // KV és eventualment coherent: la feina pot constar acabada i el lot
    // trigar a ser visible. S'espera que la data arribi a la que diu la feina.
    lot = await llegeixLot()
    if (resultat?.updatedAt) {
      const limitVis = Date.now() + 60 * 1000
      while (
        Date.now() < limitVis
        && !(lot.updatedAt && new Date(lot.updatedAt) >= new Date(resultat.updatedAt))
      ) {
        await new Promise((res) => setTimeout(res, 2000))
        lot = await llegeixLot()
      }
    }
    if (resultat?.cache === 'transient') {
      console.warn("⚠ El lot públic NO s'ha pogut desar (transient): les dades de sota poden ser les d'abans.")
    }
    console.log(`✓ Radar refrescat: ${(lot.stories || []).length} notícies al lot.`)
  } catch (e) {
    console.error('✗ No s\'ha pogut refrescar el radar:', e.message)
    process.exit(1)
  }

  // 2. El lot ja el tenim.
  const stories = lot.stories || []

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
