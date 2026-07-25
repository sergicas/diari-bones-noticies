// Fotos reals per a les peces amb lloc concret (Fase 4).
//
// Per a QUALSEVOL peça del radar que esmenti un lloc concret (al titular o al
// camp de lloc), es busca una fotografia real del lloc a Wikimedia Commons
// (llicències lliures, sense clau d'API). Si en surt una de fiable,
// substitueix la il·lustració generada i hi afegeix el crèdit obligatori
// (autor + llicència). Si no, la peça conserva el dibuix de casa: mai una
// foto "aproximada" que pugui fer creure que és la foto del fet.
// (Nascut com a pilot d'Agenda i Local el 25-07-2026; ampliat a tot el diari
// el mateix dia a petició de l'editor.)
//
// Criteri d'honestedat: la foto és sempre DEL LLOC (el poble, el mercat, el
// teatre), mai pretén ser la foto de l'esdeveniment. El peu ho diu clar.

// Llocs massa genèrics per cercar-hi una foto: no identifiquen cap indret.
const GENERIC_PLACES = new Set([
  'món',
  'catalunya',
  'espanya',
  'europa',
  'internacional',
  'barcelona', // massa ampli: milers de fotos sense relació amb la peça
])

// Pobles i ciutats del primer cercle (coincideix amb les paraules clau de la
// secció Local a src/lib/sections.js, més variants amb article).
const KNOWN_PLACES = [
  'mataró',
  'argentona',
  'arenys de mar',
  'arenys de munt',
  'premià de mar',
  'premià de dalt',
  'vilassar de mar',
  'vilassar de dalt',
  'cabrera de mar',
  'el masnou',
  'canet de mar',
  'calella',
  'pineda de mar',
  'malgrat de mar',
  'tordera',
  'sant andreu de llavaneres',
  'llavaneres',
  'alella',
  'montgat',
  'cabrils',
  'teià',
  'òrrius',
  'dosrius',
  'sant pol de mar',
  'sant cebrià de vallalta',
  'sant iscle de vallalta',
  'palafolls',
  'santa susanna',
  'caldes d’estrac',
  "caldes d'estrac",
]

// Fitxers de Commons que NO són fotografies del lloc (escuts, mapes, logos…).
const BANNED_TITLE_WORDS =
  /escut|coat of arms|mapa|map of|locator|bandera|flag|logo|segell|seal|senyera|blas(o|ó)n|diagram|chart|plànol|plano/i

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function matchesWholeWord(text, place) {
  const escaped = place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, 'iu')
  return re.test(text)
}

// Treu el lloc concret d'una peça: primer el títol (més específic), després el
// camp location. Retorna null si només hi ha llocs genèrics.
export function extractPlace(story) {
  const title = normalize(story?.title)
  const location = normalize(story?.location)

  for (const place of KNOWN_PLACES) {
    if (matchesWholeWord(title, normalize(place))) return place
  }
  for (const place of KNOWN_PLACES) {
    if (matchesWholeWord(location, normalize(place))) return place
  }

  // Location amb un topònim propi no genèric ("Granollers", "Berga, Berguedà"):
  // agafem el primer tros abans de la coma si no és a la llista de genèrics.
  const firstChunk = String(story?.location || '').split(',')[0].trim()
  if (
    firstChunk &&
    firstChunk.length >= 4 &&
    !GENERIC_PLACES.has(normalize(firstChunk))
  ) {
    return firstChunk
  }

  return null
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildCommonsSearchUrl(place) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${place}`,
    gsrnamespace: '6',
    gsrlimit: '8',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '1200',
  })
  return `https://commons.wikimedia.org/w/api.php?${params.toString()}`
}

export function pickBestCommonsPhoto(apiResponse, place) {
  const pages = Object.values(apiResponse?.query?.pages || {})
  if (!pages.length) return null

  // L'ordre de rellevància de la cerca es conserva amb l'índex de resultat.
  pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99))

  for (const page of pages) {
    const title = page?.title || ''
    if (BANNED_TITLE_WORDS.test(title)) continue
    if (!/\.jpe?g$/i.test(title)) continue

    const info = page?.imageinfo?.[0]
    const url = info?.thumburl || info?.url
    if (!url) continue

    const meta = info?.extmetadata || {}
    const author = stripHtml(meta.Artist?.value) || 'Wikimedia Commons'
    const license = stripHtml(meta.LicenseShortName?.value) || 'llicència lliure'

    return {
      url,
      author,
      license,
      sourceUrl: info?.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
      place,
      source: 'wikimedia-commons',
    }
  }
  return null
}

export async function findCommonsPhoto(place, { fetchFn = fetch, timeoutMs = 6000 } = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(buildCommonsSearchUrl(place), {
      headers: {
        // Etiqueta de bon veïnatge que demana la Wikimedia Foundation.
        'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
        accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!response.ok) return null
    const data = await response.json()
    return pickBestCommonsPhoto(data, place)
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

// Sostre de cerques per refresc: cada cerca és una subpetició i el radar ja
// va just de pressupost (vegeu la rotació de fonts a liveNews.js). Amb la
// marca photoChecked, en pocs refrescos totes les peces queden mirades.
const MAX_LOOKUPS_PER_RUN = 8

// Recorre les peces publicades i intenta posar foto real a les que tenen un
// lloc concret i encara no s'han mirat. Marca photoChecked per no repetir la
// cerca (i la subpetició) a cada refresc. Muta les peces i retorna quantes
// fotos noves s'han trobat.
function applyPhotoFields(story, photo) {
  story.photo = photo
  story.imageUrl = photo.url
  story.imageAlt = `Fotografia de ${photo.place}`
  story.imageCredit = `Foto: ${photo.author} · ${photo.license} · Wikimedia Commons (imatge del lloc, no de l’acte)`
}

export async function attachRealPhotos(stories, options = {}) {
  const { fetchFn = fetch, maxLookups = MAX_LOOKUPS_PER_RUN } = options
  let lookups = 0
  let found = 0

  for (const story of stories) {
    if (!story) continue

    // Peça arrossegada amb foto ja trobada: l'enriquiment de cada refresc li
    // reescriu imageUrl/imageCredit amb el dibuix; es reapliquen els camps de
    // la foto sense cap subpetició nova.
    if (story.photo?.url) {
      applyPhotoFields(story, story.photo)
      continue
    }

    if (story.photoChecked) continue
    // El sostre limita només les CERQUES noves (continue, no break: les
    // reaplicacions d'amunt no gasten res i han d'arribar a totes les peces).
    if (lookups >= maxLookups) continue

    const place = extractPlace(story)
    story.photoChecked = true
    if (!place) continue

    lookups += 1
    const photo = await findCommonsPhoto(place, { fetchFn })
    if (!photo) continue

    applyPhotoFields(story, photo)
    found += 1
  }

  return found
}
