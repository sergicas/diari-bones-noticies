// Proximitat geogràfica i nivells de distància per a El Bon Diari.
//
// Des del 28-07-2026 la navegació del diari és geogràfica i no temàtica: en
// lloc de seccions (Cultura, Ciència, Ho comprovem…) el lector es mou pel mapa,
// del més pròxim al més llunyà. Els sis nivells són acumulatius: triar "Maresme"
// inclou Mataró, i triar "Catalunya" inclou tot el que hi ha a dins.

export const mataroKeywords = ['mataró', 'mataro']

// Municipis del Maresme. Mataró en forma part, però té nivell propi perquè és
// la ciutat del diari; per això aquí no hi torna a sortir.
export const maresmeKeywords = [
  'maresme',
  'argentona',
  'cabrera de mar',
  'vilassar',
  'premià',
  'premia de mar',
  'el masnou',
  'masnou',
  'arenys de mar',
  'arenys de munt',
  'canet de mar',
  'calella',
  'pineda de mar',
  'malgrat de mar',
  'santa susanna',
  'palafolls',
  'tordera',
  'llavaneres',
  "caldes d'estrac",
  'sant vicenç de montalt',
  'sant pol de mar',
  'teià',
  'alella',
  'tiana',
  'montgat',
  'dosrius',
  'òrrius',
  'cabrils',
  'vilalba sasserra',
  'sant cebrià de vallalta',
  'sant iscle de vallalta',
]

export const cataloniaKeywords = [
  'catalunya',
  'catalonia',
  'cataluña',
  'barcelona',
  'girona',
  'lleida',
  'tarragona',
  'mataró',
  'maresme',
  'sabadell',
  'terrassa',
  'reus',
  'vic',
  'manresa',
  'igualada',
  'sitges',
  'tortosa',
  'amposta',
  'badalona',
  'hospitalet',
  'llobregat',
  'empordà',
  'ebre',
  'garrotxa',
  'olot',
  'figueres',
  'vilafranca',
]

export const spainKeywords = [
  'espanya',
  'españa',
  'spain',
  'madrid',
  'valència',
  'valencia',
  'sevilla',
  'saragossa',
  'zaragoza',
  'galicia',
  'andalusia',
  'andalucía',
  'navarra',
  'asturias',
  'castilla',
  'castella',
  'euskadi',
  'país basc',
  'pais basc',
  'bilbao',
  'oviedo',
  'alicante',
  'múrcia',
  'murcia',
  'palma',
  'mallorca',
  'menorca',
  'eivissa',
  'ibiza',
  'canàries',
  'canarias',
]

export const europeKeywords = [
  'europa',
  'europe',
  'paris',
  'frança',
  'france',
  'alemanya',
  'germany',
  'italia',
  'italy',
  'portugal',
  'lisboa',
  'lisbon',
  'brussel·les',
  'brussels',
  'irlanda',
  'ireland',
]

export const distanceBandConfig = [
  {
    id: 'mataro',
    rank: 0,
    label: 'Mataró',
    editorialLabel: 'A casa',
    description: 'La ciutat del diari: el que passa a tocar de casa.',
  },
  {
    id: 'maresme',
    rank: 1,
    label: 'Maresme',
    editorialLabel: 'A tocar',
    description: 'La comarca sencera, de Montgat a Tordera.',
  },
  {
    id: 'catalunya',
    rank: 2,
    label: 'Catalunya',
    editorialLabel: 'El país',
    description:
      'Prioritat absoluta per a peces de Catalunya i del seu entorn immediat.',
  },
  {
    id: 'estat',
    rank: 3,
    label: 'Estat Espanyol',
    editorialLabel: 'A prop',
    description:
      "Quan no n'hi ha prou amb el radar local, ampliem a la resta de l'Estat.",
  },
  {
    id: 'europa',
    rank: 4,
    label: 'Europa',
    editorialLabel: 'Més enllà',
    description:
      'El ventall europeu entra quan aporta solucions replicables o context útil.',
  },
  {
    id: 'mon',
    rank: 5,
    label: 'Món',
    editorialLabel: 'Obertura global',
    description:
      'Només arribem aquí quan cal obrir la mirada cap a fora de manera progressiva.',
  },
]

// La navegació del diari. Són ACUMULATIVES i van de dins cap enfora: "Maresme"
// inclou Mataró, "Catalunya" inclou la comarca, i així fins al món.
export const distanceFilterOptions = [
  {
    id: 'mataro',
    label: 'Mataró',
    description: 'Només la ciutat.',
    maxRank: 0,
  },
  {
    id: 'maresme',
    label: 'Maresme',
    description: 'Mataró i la comarca.',
    maxRank: 1,
  },
  {
    id: 'catalunya',
    label: 'Catalunya',
    description: 'Tot el país.',
    maxRank: 2,
  },
  {
    id: 'estat',
    label: 'Estat Espanyol',
    description: "Catalunya i la resta de l'Estat.",
    maxRank: 3,
  },
  {
    id: 'europa',
    label: 'Europa',
    description: "Fins al continent.",
    maxRank: 4,
  },
  {
    id: 'mon',
    label: 'Món',
    description: 'Sense límit geogràfic.',
    maxRank: 5,
  },
]

// La portada s'obre amb TOT visible i el lector va estrenyent. Si el valor per
// defecte fos el primer de la llista (Mataró), el diari s'obriria amagant-se la
// major part de si mateix.
export const defaultDistanceFilter = 'mon'

const wholeWordRegexCache = new Map()
function includesAnyKeyword(text, keywords) {
  let regex = wholeWordRegexCache.get(keywords)
  if (!regex) {
    const alternation = keywords
      .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')
    regex = new RegExp(`(^|[^\\p{L}])(?:${alternation})([^\\p{L}]|$)`, 'iu')
    wholeWordRegexCache.set(keywords, regex)
  }
  return regex.test(text)
}

export function getDistanceBand(story) {
  const geographicText = [
    story.location,
    story.title,
    story.summary,
    story.impact,
    story.source,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  // De dins cap enfora: el primer nivell que coincideixi mana. Mataró i el
  // Maresme s'han de mirar ABANS que Catalunya, perquè "mataró" i "maresme"
  // també són a la llista catalana i, si no, tot cauria a Catalunya.
  if (includesAnyKeyword(geographicText, mataroKeywords)) {
    return distanceBandConfig[0]
  }

  if (includesAnyKeyword(geographicText, maresmeKeywords)) {
    return distanceBandConfig[1]
  }

  if (includesAnyKeyword(geographicText, cataloniaKeywords)) {
    return distanceBandConfig[2]
  }

  if (includesAnyKeyword(geographicText, spainKeywords)) {
    return distanceBandConfig[3]
  }

  if (includesAnyKeyword(geographicText, europeKeywords)) {
    return distanceBandConfig[4]
  }

  return distanceBandConfig[5]
}

export function sortByDistanceAndDate(leftStory, rightStory) {
  const leftBand = getDistanceBand(leftStory)
  const rightBand = getDistanceBand(rightStory)

  if (leftBand.rank !== rightBand.rank) {
    return leftBand.rank - rightBand.rank
  }

  return (
    new Date(rightStory.publishedAt).getTime() -
    new Date(leftStory.publishedAt).getTime()
  )
}

export function getOriginLabel(origin, editorialFormat) {
  if (editorialFormat === 'verification') {
    return 'Verificació'
  }
  if (editorialFormat === 'agenda') {
    return 'Agenda útil'
  }
  if (editorialFormat === 'opportunity') {
    return 'Et pot servir'
  }
  if (editorialFormat === 'data') {
    return 'El marcador'
  }
  if (origin === 'feed') {
    return 'Radar en viu'
  }

  return 'Redacció'
}

export function getOriginBadge(origin, editorialFormat) {
  if (editorialFormat === 'verification') {
    return 'Verificació'
  }
  if (editorialFormat === 'agenda') {
    return 'Agenda útil'
  }
  if (editorialFormat === 'opportunity') {
    return 'Et pot servir'
  }
  if (editorialFormat === 'data') {
    return 'El marcador'
  }
  if (origin === 'feed') {
    return 'Radar en viu'
  }

  return ''
}
