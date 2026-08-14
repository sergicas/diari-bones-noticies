// DEDUPLICACIÓ PER ESDEVENIMENT, no només per URL.
//
// La sala de revisió va rebre alhora tres peces del MATEIX eclipsi solar, de
// fonts diferents. Cap era duplicada segons la URL, i per això totes tres van
// passar. Per a qui revisa, això és soroll: ha de llegir tres vegades el mateix
// per acabar aprovant-ne una.
//
// El criteri és deliberadament CONSERVADOR. Ajuntar dues peces que no són el
// mateix fet és pitjor que deixar-ne passar dues de semblants: la primera
// perd informació, la segona només fa perdre mig minut a qui llegeix. Per
// això calen dues condicions alhora, no una.

const ACCENTS = /[̀-ͯ]/g

// Paraules massa comunes per dir res sobre de quin fet parla una peça.
const BUIDES = new Set([
  'amb', 'als', 'del', 'dels', 'les', 'els', 'una', 'uns', 'unes', 'per',
  'que', 'com', 'des', 'the', 'and', 'for', 'with', 'from', 'this', 'that',
  'sobre', 'entre', 'seva', 'seus', 'seves', 'seu', 'més', 'mes', 'han',
  'hi', 'ha', 'als', 'una', 'sense', 'fins', 'quan', 'què', 'qui',
])

function normalitza(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(ACCENTS, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((mot) => mot.length >= 4 && !BUIDES.has(mot))
}

/** Els mots que de debò identifiquen de quin fet parla la peça. */
export function signaturaEsdeveniment(story) {
  return new Set(normalitza(story?.title))
}

function comuns(a, b) {
  let n = 0
  for (const mot of a) if (b.has(mot)) n += 1
  return n
}

/**
 * Diu si dues peces expliquen el mateix fet.
 *
 * Dues condicions HAN de complir-se alhora:
 *  - compartir almenys tres mots significatius (l'eclipsi: "eclipsi", "solar",
 *    "total"), i
 *  - que aquests siguin una part apreciable de la peça més curta, perquè dos
 *    titulars llargs amb tres mots comuns per casualitat no s'ajuntin.
 */
export function mateixEsdeveniment(a, b, { minComuns = 3, minProporcio = 0.5 } = {}) {
  const sa = signaturaEsdeveniment(a)
  const sb = signaturaEsdeveniment(b)
  if (sa.size === 0 || sb.size === 0) return false
  const compartits = comuns(sa, sb)
  if (compartits < minComuns) return false
  return compartits / Math.min(sa.size, sb.size) >= minProporcio
}

/**
 * Es queda una peça per esdeveniment, la primera de la llista.
 * L'ordre d'entrada mana: qui la crida ja les ha posades com vol.
 */
export function dedupePerEsdeveniment(stories, opcions) {
  const quedades = []
  const descartades = []
  for (const story of stories || []) {
    const igual = quedades.find((altra) => mateixEsdeveniment(story, altra, opcions))
    if (igual) descartades.push({ story, com: igual })
    else quedades.push(story)
  }
  return { quedades, descartades }
}
