// Fotos reals amb drets verificables per al radar.
//
// Per a una peça que parla DEL LLOC es pot cercar una fotografia lliure a
// Wikimedia Commons. Una simple menció del municipi no n'hi ha prou: festivals,
// concerts, festes i altres actes conserven la il·lustració editorial pròpia,
// perquè una vista genèrica del poble faria pensar que mostra l'esdeveniment.
//
// També s'admeten fotografies temàtiques d'arxiu quan la coincidència és
// inequívoca (p. ex. un eclipsi solar) i imatges de la biblioteca oficial de
// NASA. Criteri d'honestedat: el peu ajuda, però la relació visual amb la
// notícia ha de ser honesta per ella mateixa.

import { storyImagePath } from '../lib/story-image-path.js'
import { canPublishStoryImage, hasPermissiveImageLicense } from '../lib/imageRules.js'

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
  /escut|coat of arms|mapa|map of|locator|bandera|flag|logo|segell|seal|senyera|blas(o|ó)n|diagram|chart|plànol|plano|poster|patch|insignia|illustration|drawing|painting|artist.?s impression|render/i

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

// Incrementar aquesta versió fa que les peces que havien esgotat una cerca
// amb una política antiga es tornin a comprovar una sola vegada. Evita haver
// de buidar KV i, alhora, impedeix repetir subpeticions a cada refresc.
export const PHOTO_SEARCH_VERSION = 4

const NASA_USAGE_GUIDELINES_URL =
  'https://www.nasa.gov/nasa-brand-center/images-and-media/'

// Cerques representatives deliberadament estretes. No generem una consulta a
// partir de qualsevol titular: això faria aparèixer persones, actes o llocs
// que no corresponen a la notícia. Cada regla descriu un subjecte visual que
// es pot reconèixer sense confondre una foto d'arxiu amb el fet concret.
const THEMATIC_PHOTO_RULES = [
  {
    id: 'solar-eclipse',
    query: 'solar eclipse',
    pattern: /\b(eclips[ei]?\s+solar|solar\s+eclipse|corona\s+solar)\b/i,
    terms: ['solar eclipse', 'eclipse'],
    nasa: true,
  },
  {
    id: 'aurora',
    query: 'aurora borealis',
    pattern: /\b(auror(?:a|es)\s+boreal|aurora\s+borealis|northern\s+lights)\b/i,
    terms: ['aurora borealis', 'aurora', 'northern lights'],
    nasa: true,
  },
  {
    id: 'james-webb',
    query: 'James Webb Space Telescope',
    pattern: /\b(james\s+webb|telescopi\s+webb|webb\s+space\s+telescope)\b/i,
    terms: ['james webb', 'webb space telescope', 'webb'],
    nasa: true,
  },
  {
    id: 'hubble',
    query: 'Hubble Space Telescope',
    pattern: /\b(hubble|telescopi\s+espacial\s+hubble)\b/i,
    terms: ['hubble space telescope', 'hubble'],
    nasa: true,
  },
  {
    id: 'coral-reef',
    query: 'coral reef',
    pattern: /\b(esculls?\s+de\s+corall|coral\s+reefs?)\b/i,
    terms: ['coral reef', 'coral'],
  },
  {
    id: 'wetland',
    query: 'wetland',
    pattern: /\b(aiguamolls?|zones?\s+humides?|wetlands?)\b/i,
    terms: ['wetland', 'wetlands'],
  },
  {
    id: 'right-whale',
    query: 'North Atlantic right whale',
    pattern: /\b(balena\s+franca|north\s+atlantic\s+right\s+whale)\b/i,
    terms: ['right whale', 'north atlantic right whale'],
  },
  {
    // Tema prou inequívoc per emprar una fotografia d'arxiu de l'animal.
    // La coincidència de metadades de Commons continua essent obligatòria.
    id: 'beetle',
    query: 'beetle insect',
    pattern: /\b(escarabats?|cole[oò]pters?|beetles?)\b/i,
    terms: ['beetle', 'coleoptera'],
  },
  {
    id: 'dog',
    query: 'domestic dog',
    pattern: /\b(gossos?|canins?|dogs?)\b/i,
    terms: ['domestic dog', 'dog', 'canis familiaris'],
  },
]

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

function storySubject(story) {
  return [
    story?.title,
    story?.reviewSourceTitle,
    story?.summary,
    story?.impact,
    ...(Array.isArray(story?.body) ? story.body : []),
  ].join(' ')
}

export function thematicPhotoRuleFor(story) {
  const subject = storySubject(story)
  return THEMATIC_PHOTO_RULES.find((rule) => rule.pattern.test(subject)) || null
}

function includesAnyTerm(text, terms) {
  const haystack = normalize(text)
  return terms.some((term) => haystack.includes(normalize(term)))
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

export function pickBestCommonsPhoto(apiResponse, subject, options = {}) {
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
    const sourceUrl = info?.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`
    if (!hasPermissiveImageLicense(license)) continue
    const searchable = [
      title,
      stripHtml(meta.ObjectName?.value),
      stripHtml(meta.ImageDescription?.value),
      stripHtml(meta.Categories?.value),
    ].join(' ')
    const requiredTerms = options.requiredTerms || [subject]
    if (!includesAnyTerm(searchable, requiredTerms)) continue

    return {
      url,
      author,
      license,
      sourceUrl,
      place: options.kind === 'place' ? subject : undefined,
      topic: options.kind === 'topic' ? subject : undefined,
      kind: options.kind || 'place',
      alt:
        options.kind === 'topic'
          ? `Fotografia d'arxiu relacionada amb ${subject}`
          : `Fotografia de ${subject}`,
      creditNote:
        options.kind === 'topic'
          ? 'imatge d’arxiu del tema, no del fet concret'
          : 'imatge del lloc, no de l’acte',
      source: 'wikimedia-commons',
    }
  }
  return null
}

export async function findCommonsPhoto(
  subject,
  {
    fetchFn = fetch,
    timeoutMs = 6000,
    kind = 'place',
    requiredTerms,
  } = {},
) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(buildCommonsSearchUrl(subject), {
      headers: {
        // Etiqueta de bon veïnatge que demana la Wikimedia Foundation.
        'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
        accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!response.ok) return null
    const data = await response.json()
    return pickBestCommonsPhoto(data, subject, {
      kind,
      requiredTerms,
    })
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

export function buildNasaSearchUrl(query) {
  // La resposta queda acotada: no cal descarregar centenars de descripcions
  // per triar una sola foto i així es manté baix el consum de memòria del
  // Worker.
  const params = new URLSearchParams({
    q: query,
    media_type: 'image',
    page_size: '10',
  })
  return `https://images-api.nasa.gov/search?${params.toString()}`
}

export function pickBestNasaPhoto(apiResponse, rule) {
  const items = apiResponse?.collection?.items
  if (!Array.isArray(items)) return null

  for (const item of items) {
    const data = item?.data?.[0] || {}
    const title = String(data.title || '')
    const description = String(data.description || '')
    const keywords = Array.isArray(data.keywords) ? data.keywords.join(' ') : ''
    if (BANNED_TITLE_WORDS.test(title)) continue
    if (!includesAnyTerm(`${title} ${description} ${keywords}`, rule.terms)) continue
    // El camp copyright identifica material de tercers dins la biblioteca.
    // Sense una llicència individual compatible no n'assumim cap dret.
    if (String(data.copyright || '').trim()) continue

    const image = (item.links || []).find(
      (link) =>
        link?.render === 'image' &&
        /^https:\/\/images-assets\.nasa\.gov\//i.test(link?.href || '') &&
        /\.jpe?g(?:$|\?)/i.test(link?.href || ''),
    )
    const nasaId = String(data.nasa_id || '').trim()
    if (!image?.href || !nasaId) continue

    const photographer = String(data.photographer || '').trim()
    return {
      url: image.href,
      author: photographer ? `NASA · ${photographer}` : 'NASA',
      license: 'Public domain (NASA)',
      licenseProofUrl: NASA_USAGE_GUIDELINES_URL,
      sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(nasaId)}`,
      topic: rule.query,
      kind: 'topic',
      alt: `Fotografia d'arxiu de NASA relacionada amb ${rule.query}`,
      creditNote: 'imatge d’arxiu del tema, no del fet concret',
      source: 'nasa-images',
    }
  }
  return null
}

export async function findNasaPhoto(
  rule,
  { fetchFn = fetch, timeoutMs = 6000 } = {},
) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(buildNasaSearchUrl(rule.query), {
      headers: {
        'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
        accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!response.ok) return null
    return pickBestNasaPhoto(await response.json(), rule)
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
  story.imageAlt = photo.alt || `Fotografia de ${photo.place || photo.topic}`
  const repository =
    photo.source === 'nasa-images' ? 'NASA Image and Video Library' : 'Wikimedia Commons'
  story.imageCredit = `Foto: ${photo.author} · ${photo.license} · ${repository} (${photo.creditNote})`
  story.imageAttributionUrl = photo.sourceUrl
  story.imageRights = {
    verified: true,
    license: photo.license,
    proofUrl: photo.licenseProofUrl || photo.sourceUrl,
  }
  story.photoChecked = true
  story.photoSearchVersion = PHOTO_SEARCH_VERSION
}

function storedPhotoIsStillEligible(story) {
  if (!story?.photo) return true
  if (story.photo.source === 'nasa-images') {
    const rule = thematicPhotoRuleFor(story)
    return Boolean(rule?.nasa && rule.query === story.photo.topic)
  }
  if (story.photo.source === 'wikimedia-commons') {
    if (story.photo.kind === 'topic') {
      const rule = thematicPhotoRuleFor(story)
      return Boolean(rule && rule.query === story.photo.topic)
    }
    return isPlacePhotoEligible(story)
  }
  return true
}

// Retira una foto de lloc que una versió anterior ja havia guardat per a un
// acte i restaura la ruta de la il·lustració pròpia. Això saneja tant la portada
// en memòria com el detall persistent sense haver d'esperar un nou refresc.
export function sanitizeStoryPhoto(story) {
  if (!story) return story
  const hasAllowedPhoto = canPublishStoryImage(story)
  if (hasAllowedPhoto && storedPhotoIsStillEligible(story)) return story

  delete story.photo
  delete story.imageRights
  story.photoChecked = true
  story.photoSearchVersion = PHOTO_SEARCH_VERSION
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
    const searchAlreadyCompleted =
      story.photoSearchVersion === PHOTO_SEARCH_VERSION

    // Primer saneja qualsevol foto persistida que hagi deixat de complir la
    // política actual de drets o de rellevància.
    sanitizeStoryPhoto(story)

    // Peça arrossegada amb foto ja trobada: l'enriquiment de cada refresc li
    // reescriu imageUrl/imageCredit amb el dibuix; es reapliquen els camps de
    // la foto sense cap subpetició nova.
    if (story.photo?.url) {
      applyPhotoFields(story, story.photo)
      continue
    }

    // Les imatges que ja venen d'un Circuit A amb drets verificats són més
    // precises que qualsevol cerca d'arxiu; no se substitueixen ni gasten una
    // subpetició addicional.
    if (story.imageRights && canPublishStoryImage(story)) {
      story.photoChecked = true
      story.photoSearchVersion = PHOTO_SEARCH_VERSION
      continue
    }

    if (searchAlreadyCompleted) continue
    // El sostre limita només les CERQUES noves (continue, no break: les
    // reaplicacions d'amunt no gasten res i han d'arribar a totes les peces).
    if (lookups >= maxLookups) continue

    story.photoChecked = true
    story.photoSearchVersion = PHOTO_SEARCH_VERSION

    const thematicRule = thematicPhotoRuleFor(story)
    const place = isPlacePhotoEligible(story) ? extractPlace(story) : null
    if (!thematicRule && !place) continue

    lookups += 1
    let photo = null
    if (thematicRule?.nasa) {
      photo = await findNasaPhoto(thematicRule, { fetchFn })
    } else if (thematicRule) {
      photo = await findCommonsPhoto(thematicRule.query, {
        fetchFn,
        kind: 'topic',
        requiredTerms: thematicRule.terms,
      })
    } else {
      photo = await findCommonsPhoto(place, {
        fetchFn,
        kind: 'place',
        requiredTerms: [place],
      })
    }
    if (!photo) continue

    applyPhotoFields(story, photo)
    found += 1
  }

  return found
}
