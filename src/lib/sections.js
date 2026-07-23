// Definició de les seccions editorials d'El Bon Diari i classificació temàtica

export const editorialSections = [
  {
    id: 'local',
    label: 'Local',
    description:
      'Mataró i el Maresme: el que passa al costat de casa.',
    categories: ['Local'],
    keywords: ['mataró', 'maresme', 'argentona', 'arenys', 'premià', 'vilassar', 'cabrera de mar', 'masnou', 'canet de mar', 'calella', 'pineda de mar', 'malgrat de mar', 'tordera', 'llavaneres', 'alella', 'montgat'],
  },
  {
    id: 'verificacio',
    label: 'Ho comprovem',
    description:
      'Rumors i afirmacions contrastats amb metodologia i fonts visibles.',
    categories: ['Verificació'],
    keywords: ['verificació', 'verificat', 'desmentim', 'comprovem'],
  },
  {
    id: 'marcador',
    label: 'El marcador',
    description:
      'Indicadors públics explicats amb referència temporal i font original.',
    categories: ['Dades'],
    keywords: ['idescat', 'estadística', 'indicador', 'dades'],
  },
  {
    id: 'et-pot-servir',
    label: 'Et pot servir',
    description:
      'Ajuts i convocatòries obertes amb termini, destinataris i enllaç oficial.',
    categories: ['Oportunitats'],
    keywords: ['ajut', 'subvenció', 'convocatòria', 'termini'],
  },
  {
    id: 'agenda',
    label: 'Agenda',
    description:
      'Activitats culturals de proximitat seleccionades des de la font oficial.',
    categories: ['Agenda'],
    keywords: ['agenda', 'activitat', 'exposició', 'concert'],
  },
  {
    id: 'politica',
    label: 'Política',
    description:
      'Institucions, drets i decisions públiques quan generen millores concretes.',
    categories: ['Política'],
    keywords: ['govern', 'generalitat', 'ajuntament', 'parlament', 'política'],
  },
  {
    id: 'societat',
    label: 'Societat',
    description:
      'Comunitat, barris, convivència i iniciatives socials amb impacte humà.',
    categories: ['Societat', 'Comunitat'],
    keywords: ['barri', 'veïns', 'comunitat', 'famílies', 'ciutadania'],
  },
  {
    id: 'cultura',
    label: 'Cultura',
    description:
      'Arts, llibres, patrimoni, llengua i projectes creatius que obren finestres.',
    categories: ['Cultura'],
    keywords: ['teatre', 'cinema', 'llibre', 'música', 'festival', 'patrimoni'],
  },
  {
    id: 'esports',
    label: 'Esports',
    description:
      'Esport de base, fites col·lectives i pràctiques que mouen la comunitat.',
    categories: ['Esports'],
    keywords: ['esport', 'equip', 'club', 'campionat', 'atleta'],
  },
  {
    id: 'mon-digital',
    label: 'Món digital',
    description:
      'Tecnologia i eines digitals que poden fer la vida una mica més fàcil.',
    categories: ['Tecnologia', 'Món digital'],
    keywords: [
      'intel·ligència artificial',
      'tecnologia',
      'tecnològic',
      'ciberseguretat',
      'programari',
      'robòtica',
      'algoritme',
      'videojoc',
      'xarxes socials',
    ],
  },
  {
    id: 'ciencia',
    label: 'Ciència',
    description:
      'Recerca, descobertes i coneixement que eixamplen el que sabem del món.',
    categories: ['Ciència', 'Coneixement'],
    keywords: ['recerca', 'descoberta', 'científic', 'astronomia', 'biologia', 'genètica', 'fòssil'],
  },
  {
    id: 'economia',
    label: 'Economia',
    description:
      'Feina, empreses i diners quan creen oportunitats o reparteixen millor.',
    categories: ['Economia'],
    keywords: ['empresa', 'feina', 'ocupació', 'inversió', 'pime', 'startup', 'cooperativa', 'salari'],
  },
  {
    id: 'salut',
    label: 'Salut',
    description:
      'Prevenció, cures i recerca mèdica explicades des del seu benefici social.',
    categories: ['Salut'],
    keywords: ['salut', 'hospital', 'sanitat', 'metge', 'vacuna', 'pacient', 'prevenció'],
  },
  {
    id: 'medi-ambient',
    label: 'Medi ambient',
    description:
      'Clima, natura, energia i biodiversitat quan hi ha solucions verificables.',
    categories: ['Medi ambient', 'Clima'],
    keywords: ['clima', 'natura', 'energia', 'biodiversitat', 'platja'],
  },
  {
    id: 'educacio',
    label: 'Educació',
    description:
      'Aprenentatge, escoles i projectes formatius amb retorn per a la societat.',
    categories: ['Educació'],
    keywords: ['escola', 'institut', 'universitat', 'alumnes', 'docents'],
  },
  {
    id: 'solidaritat',
    label: 'Solidaritat',
    description:
      'Suport mutu, voluntariat i iniciatives que no deixen ningú enrere.',
    categories: ['Solidaritat'],
    keywords: ['solidaritat', 'voluntariat', 'ajut', 'donació', 'acollida'],
  },
  {
    id: 'internacional',
    label: 'Internacional',
    description:
      'Acords, processos i respostes de fora que també ens afecten.',
    categories: ['Internacional', 'Món', 'Europa'],
    keywords: ['onu', 'unió europea', 'internacional'],
  },
]

export const serviceSectionIds = new Set([
  'verificacio',
  'marcador',
  'et-pot-servir',
  'agenda',
])

export const fallbackSection = editorialSections.find(
  (section) => section.id === 'societat',
)

function normalizeSectionText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesWholeWord(text, keyword) {
  const re = new RegExp(`(^|[^\\p{L}])${escapeRegExp(keyword)}([^\\p{L}]|$)`, 'iu')
  return re.test(text)
}

export function getStorySection(story) {
  const category = normalizeSectionText(story.category)
  const text = [
    story.category,
    story.title,
    story.summary,
    story.location,
    story.impact,
    story.source,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    editorialSections.find((section) =>
      section.categories.some(
        (sectionCategory) => normalizeSectionText(sectionCategory) === category,
      ),
    ) ??
    editorialSections.find((section) =>
      section.keywords.some((keyword) => matchesWholeWord(text, keyword)),
    ) ??
    fallbackSection
  )
}
