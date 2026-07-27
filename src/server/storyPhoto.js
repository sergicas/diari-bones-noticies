// Fotos reals per a les peces centrades en un lloc concret (Fase 4).
//
// Per a una peça que parla DEL LLOC es pot cercar una fotografia lliure a
// Wikimedia Commons. Una simple menció del municipi no n'hi ha prou: festivals,
// concerts, festes i altres actes conserven la il·lustració editorial pròpia,
// perquè una vista genèrica del poble faria pensar que mostra l'esdeveniment.
//
// Criteri d'honestedat: el peu de foto ajuda, però la relació visual amb la
// notícia ha de ser honesta per ella mateixa.

import { storyImagePath } from '../lib/story-image-path.js'

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

// Una foto genèrica del municipi no és una imatge prou relacionada amb un acte.
// Incloem plurals i formats culturals, esportius i comunitaris habituals.
const EVENT_WORDS =
  /\b(festivals?|concerts?|festes?|actes?|agenda|espectacles?|tallers?|jornades?|fires?|exposicions?|mostres?|entrades?|recitals?|projeccions?|cicles?|musica|teatre|dansa|curses?|partits?|campionats?|presentacions?|premis?|gales?)\b/i

// En dades, verificacions i oportunitats, una foto genèrica del municipi no
// explica el fet i pot produir coincidències semàntiques falses (p. ex.
// «Mataró» també és el nom d'una locomotora històrica). Aquests formats fan
// servir sempre una il·lustració editorial vinculada al titular.
const PLACE_PHOTO_EXCLUDED_FORMATS = new Set([
  'agenda',
  'data',
  'opportunity',
  'verification',
])

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

// Només una peça realment centrada en el territori pot rebre una foto genèrica
// del lloc. Agenda ja és, per definició, una col·lecció d'actes.
export function isPlacePhotoEligible(story) {
  if (!extractPlace(story)) return false
  if (normalize(story?.category) === 'agenda') return false
  if (
    PLACE_PHOTO_EXCLUDED_FORMATS.has(normalize(story?.editorialFormat))
  ) {
    return false
  }

  const subject = normalize(
    [
      story?.title,
      story?.summary,
      story?.impact,
      ...(Array.isArray(story?.body) ? story.body : []),
    ].join(' '),
  )
  return !EVENT_WORDS.test(subject)
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

// Retira una foto de lloc que una versió anterior ja havia guardat per a un
// acte i restaura la ruta de la il·lustració pròpia. Això saneja tant la portada
// en memòria com el detall persistent sense haver d'esperar un nou refresc.
export function sanitizeStoryPhoto(story) {
  if (!story || isPlacePhotoEligible(story)) return story
  if (story.photo?.source !== 'wikimedia-commons') return story

  delete story.photo
  story.photoChecked = true
  story.imageUrl = storyImagePath(story.url, {
    title: story.title,
    category: story.category,
    brief: story.imageBrief,
  })
  story.imageAlt = `Il·lustració editorial de la notícia: ${story.title}`
  story.imageCredit = 'El Bon Diari (il·lustració IA)'
  story.imageAttributionUrl = ''
  return story
}

export function sanitizeStoryPhotos(stories) {
  if (!Array.isArray(stories)) return stories
  stories.forEach(sanitizeStoryPhoto)
  return stories
}

export async function attachRealPhotos(stories, options = {}) {
  const { fetchFn = fetch, maxLookups = MAX_LOOKUPS_PER_RUN } = options
  let lookups = 0
  let found = 0

  for (const story of stories) {
    if (!story) continue

    // Primer saneja fotografies persistides amb el criteri antic. Si la peça
    // és un acte, no es cerca ni es reaplica cap foto genèrica del municipi.
    if (!isPlacePhotoEligible(story)) {
      sanitizeStoryPhoto(story)
      story.photoChecked = true
      continue
    }

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
