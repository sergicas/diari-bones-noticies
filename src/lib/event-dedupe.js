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
/** Els números del titular: anys, xifres, quantitats. */
function xifres(story) {
  return new Set(String(story?.title || '').match(/\d+/g) || [])
}

function xifresIncompatibles(a, b) {
  const xa = xifres(a)
  const xb = xifres(b)
  if (xa.size === 0 || xb.size === 0) return false
  // Si totes dues porten números, han de portar EXACTAMENT els mateixos.
  //
  // "Un eclipsi visible a Espanya el 2026" i el mateix titular amb 2027 només
  // es diferencien en l'any. I "missió 2026 a 300 km" i "missió 2026 a 900 km"
  // comparteixen l'any però parlen de coses diferents: no n'hi ha prou que en
  // coincideixi una. Com que ara no es descarta res, ser conservador només vol
  // dir suggerir menys agrupacions, que és el costat bo per equivocar-se.
  if (xa.size !== xb.size) return true
  for (const n of xa) if (!xb.has(n)) return true
  return false
}

export function mateixEsdeveniment(a, b, { minComuns = 3, minProporcio = 0.5 } = {}) {
  if (xifresIncompatibles(a, b)) return false
  const sa = signaturaEsdeveniment(a)
  const sb = signaturaEsdeveniment(b)
  if (sa.size === 0 || sb.size === 0) return false
  const compartits = comuns(sa, sb)
  if (compartits < minComuns) return false
  return compartits / Math.min(sa.size, sb.size) >= minProporcio
}

/**
 * Agrupa peces que semblen el mateix fet SENSE descartar-ne cap.
 *
 * La primera versió d'això suprimia les repetides, i era un camí de pèrdua
 * silenciosa: una peça que el programa considerava duplicada no arribava a la
 * sala, es marcava com a vista durant catorze dies i desapareixia sense que
 * cap persona l'hagués vista mai. Amb un criteri que confonia l'eclipsi del
 * 2026 amb el del 2027, això és perdre notícies de veritat.
 *
 * Ara totes arriben a la sala. Les que semblen repetides porten
 * `possibleDuplicateOf` amb l'identificador de la representant, i la sala les
 * ensenya agrupades perquè decideixi una persona. El programa suggereix; no
 * decideix.
 */
export function agrupaPerEsdeveniment(stories, { idDe = (s) => s?.id, ...opcions } = {}) {
  const representants = []
  return (stories || []).map((story) => {
    const igual = representants.find((altra) =>
      mateixEsdeveniment(story, altra, opcions),
    )
    if (!igual) {
      representants.push(story)
      // La marca s'esborra SEMPRE, també a les representants. Si en quedava
      // una d'antiga —desada quan la peça va entrar— podia apuntar a una
      // representant que ja hagi sortit de la sala, i llavors la peça es
      // considerava seguidora d'algú que no hi és i no es dibuixava enlloc.
      return { ...story, possibleDuplicateOf: null }
    }
    return { ...story, possibleDuplicateOf: idDe(igual) || null }
  })
}
