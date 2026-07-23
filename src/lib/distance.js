// Proximitat geogràfica i nivells de distància per a El Bon Diari

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
    id: 'catalunya',
    rank: 0,
    label: 'Catalunya',
    editorialLabel: 'A tocar',
    description:
      'Prioritat absoluta per a peces de Catalunya i del seu entorn immediat.',
  },
  {
    id: 'estat',
    rank: 1,
    label: "Resta de l'Estat",
    editorialLabel: 'A prop',
    description:
      "Quan no n'hi ha prou amb el radar local, ampliem a la resta de l'Estat.",
  },
  {
    id: 'europa',
    rank: 2,
    label: 'Europa',
    editorialLabel: 'Més enllà',
    description:
      'El ventall europeu entra quan aporta solucions replicables o context útil.',
  },
  {
    id: 'mon',
    rank: 3,
    label: 'Món',
    editorialLabel: 'Obertura global',
    description:
      'Només arribem aquí quan cal obrir la mirada cap a fora de manera progressiva.',
  },
]

export const distanceFilterOptions = [
  {
    id: 'progressiu',
    label: 'Ventall progressiu',
    description: 'Catalunya, Estat, Europa i món en aquest ordre.',
    maxRank: 3,
  },
  {
    id: 'catalunya',
    label: 'Només Catalunya',
    description: 'Peces estrictament locals.',
    maxRank: 0,
  },
  {
    id: 'estat',
    label: "Fins a l'Estat",
    description: "Catalunya i resta de l'Estat.",
    maxRank: 1,
  },
  {
    id: 'europa',
    label: 'Fins a Europa',
    description: 'Catalunya, Estat i Europa.',
    maxRank: 2,
  },
  {
    id: 'mon',
    label: 'Tot el mapa',
    description: 'Sense límit geogràfic.',
    maxRank: 3,
  },
]

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

  if (includesAnyKeyword(geographicText, cataloniaKeywords)) {
    return distanceBandConfig[0]
  }

  if (includesAnyKeyword(geographicText, spainKeywords)) {
    return distanceBandConfig[1]
  }

  if (includesAnyKeyword(geographicText, europeKeywords)) {
    return distanceBandConfig[2]
  }

  return distanceBandConfig[3]
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
