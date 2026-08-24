// Mapatge de categories del RSS a un conjunt canònic.
// El radar agrega 25 fonts en català, castellà, anglès i francès. Cada font
// posa el seu propi vocabulari (POLíTICA, Politics, Reino Unido, ECONOMIA -
// POLíTICA, Mail Obert, etc.). Aquest fitxer ho redueix a una llista controlada
// per evitar pastilles llardoses a les targetes.

export const CANONICAL_CATEGORIES = [
  'Política',
  'Societat',
  'Cultura',
  'Esports',
  'Salut',
  'Medi ambient',
  'Ciència',
  'Tecnologia',
  'Economia',
  'Món',
  'Europa',
  'Espanya',
  'Catalunya',
  'Educació',
  'Religió',
  'Solidaritat',
  'Verificació',
  'Agenda',
  'Oportunitats',
  'Dades',
  'Barcelona',
  'Opinió',
  'Actualitat',
]

const CATEGORY_MAP = {
  // Política
  'política': 'Política', 'politica': 'Política', 'politics': 'Política',
  'politique': 'Política', 'política nacional': 'Política',
  'parlament': 'Política', 'government': 'Política', 'elections': 'Política',

  // Societat
  'societat': 'Societat', 'sociedad': 'Societat', 'society': 'Societat',
  'société': 'Societat', 'social': 'Societat',

  // Cultura
  'cultura': 'Cultura', 'culture': 'Cultura', 'arts': 'Cultura',
  'art i disseny': 'Cultura', 'arte': 'Cultura', 'llibres': 'Cultura',
  'literatura': 'Cultura', 'literature': 'Cultura', 'cinema': 'Cultura',
  'film': 'Cultura', 'film/tv': 'Cultura', 'music': 'Cultura',
  'música': 'Cultura', 'musica': 'Cultura',

  // Esports
  'esports': 'Esports', 'esport': 'Esports', 'deportes': 'Esports',
  'deporte': 'Esports', 'sports': 'Esports', 'sport': 'Esports',
  'football': 'Esports', 'fútbol': 'Esports', 'futbol': 'Esports',

  // Salut
  'salut': 'Salut', 'salud': 'Salut', 'health': 'Salut', 'santé': 'Salut',
  'wellbeing': 'Salut', 'well-being': 'Salut', 'mental health': 'Salut',

  // Medi ambient
  'medi ambient': 'Medi ambient', 'medio ambiente': 'Medi ambient',
  'environment': 'Medi ambient', 'climate': 'Medi ambient',
  'climate change': 'Medi ambient', 'clima': 'Medi ambient',
  'environnement': 'Medi ambient', 'natura': 'Medi ambient',
  'naturaleza': 'Medi ambient', 'nature': 'Medi ambient',

  // Ciència
  'ciència': 'Ciència', 'ciencia': 'Ciència', 'science': 'Ciència',
  'recerca': 'Ciència', 'research': 'Ciència', 'investigación': 'Ciència',
  'astronomy': 'Ciència', 'astronomia': 'Ciència', 'biology': 'Ciència',
  'biotecnologia': 'Ciència', 'biotechnology': 'Ciència',

  // Tecnologia
  'tecnologia': 'Tecnologia', 'tecnología': 'Tecnologia',
  'technology': 'Tecnologia', 'tech': 'Tecnologia',
  'món digital': 'Tecnologia', 'mon digital': 'Tecnologia',
  'digital': 'Tecnologia', 'ia': 'Tecnologia', 'ai': 'Tecnologia',
  'intel·ligència artificial': 'Tecnologia', 'artificial intelligence': 'Tecnologia',

  // Salut (categoria canònica; Longevitat és un tema editorial específic)
  'longevitat': 'Salut', 'longevity': 'Salut', 'healthy aging': 'Salut',
  'envelliment': 'Salut', 'aging': 'Salut', 'ageing': 'Salut',

  // Cultura (categoria canònica; Filosofia i Literatura són temes específics)
  'filosofia': 'Cultura', 'philosophy': 'Cultura',

  // Economia
  'economia': 'Economia', 'economía': 'Economia', 'economy': 'Economia',
  'business': 'Economia', 'negocis': 'Economia', 'negocios': 'Economia',
  'finance': 'Economia', 'finanzas': 'Economia', 'finances': 'Economia',
  'markets': 'Economia', 'mercados': 'Economia', 'workplace': 'Economia',

  // Món
  'món': 'Món', 'mon': 'Món', 'mundo': 'Món', 'world': 'Món',
  'monde': 'Món', 'internacional': 'Món', 'international': 'Món',
  'global': 'Món', 'asia': 'Món', 'africa': 'Món', 'américa': 'Món',
  'reino unido': 'Món', 'royaume-uni': 'Món', 'united kingdom': 'Món', 'uk': 'Món',
  'eua': 'Món', 'eeuu': 'Món', 'usa': 'Món', 'us': 'Món',
  'china': 'Món', 'xina': 'Món', 'iran': 'Món', 'israel': 'Món',

  // Europa
  'europa': 'Europa', 'europe': 'Europa', 'ue': 'Europa', 'eu': 'Europa',
  'unión europea': 'Europa', 'union européenne': 'Europa',

  // Espanya / Catalunya (eixos geogràfics propers)
  'espanya': 'Espanya', 'españa': 'Espanya', 'spain': 'Espanya',
  'catalunya': 'Catalunya', 'cataluña': 'Catalunya', 'catalonia': 'Catalunya',

  // Educació
  'educació': 'Educació', 'educación': 'Educació', 'education': 'Educació',
  'éducation': 'Educació', 'universitats': 'Educació', 'universidades': 'Educació',
  'estudiants': 'Educació', 'students': 'Educació', 'selectivitat': 'Educació',

  // Religió
  'religió': 'Religió', 'religion': 'Religió', 'religión': 'Religió',
  'religieux': 'Religió', 'religieuse': 'Religió', 'faith': 'Religió',

  // Solidaritat
  'solidaritat': 'Solidaritat', 'solidaridad': 'Solidaritat',
  'solidarity': 'Solidaritat', 'solidarité': 'Solidaritat',
  'voluntariat': 'Solidaritat', 'voluntariado': 'Solidaritat',
  'volunteering': 'Solidaritat', 'bénévolat': 'Solidaritat',

  // Formats de servei editorial
  'verificació': 'Verificació', 'verificacion': 'Verificació',
  'verificación': 'Verificació', 'fact-check': 'Verificació',
  'fact check': 'Verificació',
  'agenda': 'Agenda', 'activitats': 'Agenda', 'events': 'Agenda',
  'oportunitats': 'Oportunitats', 'oportunidades': 'Oportunitats',
  'ajuts': 'Oportunitats', 'subvencions': 'Oportunitats',
  'dades': 'Dades', 'estadística': 'Dades', 'estadistiques': 'Dades',
  'estadístiques': 'Dades', 'data': 'Dades',

  // Barcelona (Betevé)
  'barcelona': 'Barcelona', 'bcn': 'Barcelona',
  'metropolitana': 'Barcelona', 'mobilitat': 'Barcelona',

  // Opinió
  'opinió': 'Opinió', 'opinion': 'Opinió', 'opinión': 'Opinió',
  'editorial': 'Opinió', 'columnes': 'Opinió', 'editoriales': 'Opinió',
  'mail obert': 'Opinió', 'tribuna': 'Opinió', 'cartas': 'Opinió',
}

function tryMatch(token) {
  if (!token) return ''
  const normalized = token.toLowerCase().trim()
  return CATEGORY_MAP[normalized] || ''
}

// Pren una cadena de categoria del RSS (que pot ser "ECONOMIA - POLíTICA",
// "Reino Unido", "Sports/Football", etc.) i retorna la canònica, o `null`
// si no en trobem cap. El cridant pot llavors fer servir el fallback del feed.
export function canonicalizeCategory(raw) {
  if (!raw) return null
  const direct = tryMatch(raw)
  if (direct) return direct
  // Provem dividint per separadors típics (guió, slash, coma, pipe).
  for (const piece of String(raw).split(/[\s\-/,|·]+/).filter(Boolean)) {
    const match = tryMatch(piece)
    if (match) return match
  }
  return null
}

// Si la categoria del RSS no entra al mapatge, sempre podem retrocedir al
// fallback que defineix el feed (defaultCategory) o, en últim recurs, a
// "Actualitat".
export function normalizeCategory(raw, fallback) {
  return canonicalizeCategory(raw) || fallback || 'Actualitat'
}

// --- Correcció de categoria per CONTINGUT -----------------------------------
// La categoria ve del feed d'origen (forceCategory), no del contingut. Això fa
// que una peça pugui heretar una etiqueta equivocada: p. ex. un tema de TV que
// ve d'un feed d'esports acaba etiquetat com a "Esports". Aquesta capa mira el
// títol + resum i corregeix la categoria quan hi ha un senyal temàtic clar.
// L'ordre importa: la primera regla que coincideix guanya.
const CONTENT_CATEGORY_RULES = [
  { cat: 'Cultura', rx: /(fotografi|exposici[óo]|mostra fotogr|museu|museo|museum|pintur|escultur|galer[íi]a d'?art|retrospectiva|\bcinema\b|\bcine\b|pel·?l[íi]cula|pel[íi]cula|\bfilm\b|documental|teatre|teatro|[òo]pera|concert|concierto|festival de (cinema|m[úu]sica|cine|teatre)|novel·?la|novela|\bllibre\b|\blibro\b|poesia|poes[íi]a|[àa]lbum|banda sonora|exposici)/i },
  { cat: 'Esports', rx: /(f[úu]tbol|b[àa]squet|handbol|waterpolo|tenis|tennis|\bliga\b|lliga|partit\b|partido\b|golejador|\bgol\b|golejada|jugador|entrenador|selecci[óo] (espanyola|catalana|de f[úu]tbol)|mundial de|ol[íi]mpi[ck]|maratón|marató|ciclisme|ciclismo|\bmotogp\b|f[óo]rmula 1|\bnba\b|\bipl\b|campionat|campeonato)/i },
  { cat: 'Salut', rx: /(hospital|vacuna|c[àa]ncer|c[áa]ncer|tractament m[èe]dic|tratamiento m[ée]dico|pacient|paciente|sanitat|sanidad|medicament|assaig cl[íi]nic|ensayo cl[íi]nico)/i },
  { cat: 'Medi ambient', rx: /(biodiversitat|biodiversidad|reforestaci|energia renovable|energía renovable|esp[èe]cie amenaç|especie amenaz|reciclatge|reciclaje|arrecife|escull|aiguamoll)/i },
  { cat: 'Ciència', rx: /(recerca cient[íi]fica|investigaci[óo]n cient[íi]fica|astronom|gal[àa]xia|galaxia|telescopi|f[òo]ssil|f[óo]sil|genoma|ADN\b|part[íi]cula)/i },
]

export function refineCategoryByContent(category, title = '', summary = '') {
  const text = `${title} ${summary}`.toLowerCase()
  for (const rule of CONTENT_CATEGORY_RULES) {
    if (rule.rx.test(text)) return rule.cat
  }
  // Etiquetada com a Esports però SENSE cap senyal esportiu → no és esport.
  // (Cas real: "'El sótano club', de Alba Carrillo" colat com a Esports.)
  if (category === 'Esports' && !CONTENT_CATEGORY_RULES[1].rx.test(text)) {
    return 'Societat'
  }
  return category
}

// --- Línia temàtica d'El Bon Diari -----------------------------------------
// El radar només publica peces d'aquests àmbits. La categoria del RSS no és
// prou fiable: una agenda cultural pot arribar com a "Agenda" i una iniciativa
// educativa local com a "Comarcal". Per això primer respectem les categories
// explícites admeses i, per a la resta, classifiquem pel contingut.
export const ALLOWED_EDITORIAL_TOPICS = [
  'Ciència',
  'Tecnologia',
  'IA',
  'Biotecnologia',
  'Astronomia',
  'Longevitat',
  'Filosofia',
  'Literatura',
]

// Índex públic de la línia temàtica. És compartit pel menú, la portada i
// l'hemeroteca perquè els noms i els enllaços no divergeixin amb el temps.
export const EDITORIAL_TOPIC_INDEX = [
  {
    id: 'ciencia',
    label: 'Ciència',
    description: 'Recerca i descobertes verificables que amplien el coneixement.',
    canonicalCategories: ['Ciència'],
  },
  {
    id: 'tecnologia',
    label: 'Tecnologia',
    description: 'Eines digitals i innovacions amb una utilitat humana concreta.',
    canonicalCategories: ['Tecnologia'],
  },
  {
    id: 'ia',
    label: 'IA',
    description: 'Intel·ligència artificial aplicada amb evidència, transparència i utilitat humana.',
    canonicalCategories: ['Tecnologia'],
  },
  {
    id: 'biotecnologia',
    label: 'Biotecnologia',
    description: 'Eines i recerca biològica que obren opcions de coneixement, no promeses clíniques.',
    canonicalCategories: ['Ciència', 'Salut'],
  },
  {
    id: 'astronomia',
    label: 'Astronomia',
    description: 'Observacions i descobertes que ajuden a entendre millor l’univers.',
    canonicalCategories: ['Ciència'],
  },
  {
    id: 'longevitat',
    label: 'Longevitat',
    description: 'Recerca revisada sobre envelliment saludable, sense productes ni promeses terapèutiques.',
    canonicalCategories: ['Salut', 'Ciència'],
  },
  {
    id: 'filosofia',
    label: 'Filosofia',
    description: 'Idees que ajuden a pensar millor la vida, la societat i el coneixement.',
    canonicalCategories: ['Cultura'],
  },
  {
    id: 'literatura',
    label: 'Literatura',
    description: 'Llibres, escriptura i memòria literària que amplien la conversa cultural.',
    canonicalCategories: ['Cultura'],
  },
]

// Una icona simpàtica per a cada tema. Es fa servir a TOT ARREU on apareix un
// tema: el menú, l'índex, la pàgina del tema i l'etiqueta de cada targeta.
const TOPIC_ICONS = {
  Ciència: '🔬',
  Tecnologia: '💡',
  IA: '✦',
  Biotecnologia: '🧬',
  Astronomia: '✺',
  Longevitat: '◌',
  Filosofia: '⌁',
  Literatura: '📖',
}

export function getTopicIcon(label) {
  return TOPIC_ICONS[label] || ''
}

export function getEditorialTopicBySlug(slug) {
  const normalized = String(slug || '').trim().toLowerCase()
  return EDITORIAL_TOPIC_INDEX.find((topic) => topic.id === normalized) || null
}

export function getEditorialTopicSlug(label) {
  return (
    EDITORIAL_TOPIC_INDEX.find((topic) => topic.label === label)?.id || ''
  )
}

const ALLOWED_EDITORIAL_TOPIC_SET = new Set(ALLOWED_EDITORIAL_TOPICS)
const ASTRONOMY_CIRCUIT_A_SOURCES = [
  /\bnasa\b/i,
  /\beso\b/i,
  /esa\/?hubble/i,
  /esa\/?webb/i,
]
const HUMANITIES_CIRCUIT_B_SOURCES = [
  { pattern: /\b(?:psyche|aeon)\b/i, topic: 'Filosofia' },
  { pattern: /\b(?:literary hub|public domain review)\b/i, topic: 'Literatura' },
]
const STRICTLY_OUTSIDE_TOPIC_CATEGORIES = new Set([
  'Internacional',
  'Món',
  'Europa',
  'Espanya',
  'Catalunya',
  'Clima',
  'Medi ambient',
])

function allowedTopicPattern(source) {
  // El límit Unicode inicial evita falsos positius dins d'altres paraules:
  // "consciència" no és "ciència", "transport" no és "sport" i "parts" no
  // són "arts".
  return new RegExp(`(?:^|[^\\p{L}])(?:${source})`, 'iu')
}

const ALLOWED_TOPIC_CONTENT_RULES = [
  {
    topic: 'Astronomia',
    rx: allowedTopicPattern(
      'astronom|telescopi|telescope|gal[àa]xia|galaxy|exoplanet|forat negre|black hole|estrell[ae]|star(?:$|[^\\p{L}])|cosmol|webb|hubble|observatori espacial',
    ),
  },
  {
    topic: 'Biotecnologia',
    rx: allowedTopicPattern(
      'biotecnolog|biotechnology|prote[ïi]n|protein|genoma|genome|adn|dna|arn|rna|c[èe]l·lul|cell(?:$|[^\\p{L}])|biologia sint[èe]tica|synthetic biology|molecular|enzim|enzyme|drosophila',
    ),
  },
  {
    topic: 'IA',
    rx: allowedTopicPattern(
      'intel·lig[èe]ncia artificial|inteligencia artificial|artificial intelligence|(?:IA|AI)(?:$|[^\\p{L}])|aprenentatge autom[àa]tic|machine learning|model generatiu|generative model|algoritm',
    ),
  },
  {
    topic: 'Longevitat',
    rx: allowedTopicPattern(
      'longevitat|longevity|envelliment|aging|ageing|c[èe]l·lul[ae] senescent|senescent cell|senesc[èe]ncia|senescence|healthy aging',
    ),
  },
  {
    topic: 'Filosofia',
    rx: allowedTopicPattern(
      'filosof|philosoph|[èe]tica|ethics|metaf[íi]sica|metaphysics|epistemolog|existencial|existential|pensament|thought(?:$|[^\\p{L}])',
    ),
  },
  {
    topic: 'Literatura',
    rx: allowedTopicPattern(
      'literatur|llibr|llibre|libro|book|poes|poetry|novel·?la|novela|novel(?:$|[^\\p{L}])|escriptor|writer|author|autora|autoria|mecan[òo]graf|typewriter|biblioteca',
    ),
  },
  {
    topic: 'Ciència',
    rx: allowedTopicPattern(
      'ci[èe]nci|ciencia|science|cient[íi]fic|scientist|recerca|investigaci[óo]n|research|descoberta|descubrimiento|discovery|biolog|gen[èe]tic|genetic|f[òo]ssil|f[óo]sil|fossil|laboratori|laboratorio|laboratory|assaig cl[íi]nic|ensayo cl[íi]nico|clinical trial|estudi m[èe]dic|estudio m[ée]dico|medical study',
    ),
  },
  {
    topic: 'Tecnologia',
    rx: allowedTopicPattern(
      'tecnolog|technology|tech(?:$|[^\\p{L}])|digital|programari|software|codi obert|c[óo]digo abierto|open source|rob[oò]tic|robot|ciberseguretat|ciberseguridad|cybersecurity|computaci|semiconductor|videojoc|videojuego|video game|aplicaci[óo] m[òo]bil|aplicaci[óo]n m[óo]vil|mobile app|pantalla|display|quantum dot',
    ),
  },
]

// Ordre de desempat per a una peça entrant. El primer senyal aplicable guanya:
// 1) decisió editorial manual; 2) font de Circuit A amb àmbit inequívoc;
// 3) temes més específics; 4) temes base. En especial, Longevitat va abans de
// Biotecnologia perquè la senescència pot contenir vocabulari cel·lular.
export const EDITORIAL_TOPIC_TIEBREAK_ORDER = [
  'Longevitat',
  'Astronomia',
  'Biotecnologia',
  'IA',
  'Literatura',
  'Filosofia',
  'Ciència',
  'Tecnologia',
]

// Temes el vocabulari dels quals és massa comú fora del seu camp: només
// s'assignen per contingut si la peça ja ve d'un context humanístic.
const TOPICS_ONLY_IN_HUMANITIES = new Set(['Filosofia', 'Literatura'])

// Categories d'ingesta que sí que fan de context humanístic.
const HUMANITIES_CATEGORIES = new Set(['Cultura', 'Idees', 'Literatura', 'Pensament'])

function isHumanitiesContext(story) {
  const category = String(story?.category || '').trim()
  if (HUMANITIES_CATEGORIES.has(category)) return true
  const source = sourceText(story)
  return HUMANITIES_CIRCUIT_B_SOURCES.some((rule) => rule.pattern.test(source))
}

function isCircuitA(story) {
  return story?.circuit === 'A' || story?.sourceCircuit === 'A'
}

function sourceText(story) {
  return [story?.source, story?.sourceId, story?.sourceName]
    .filter(Boolean)
    .join(' ')
}

function sourceAssignedTopic(story) {
  // La configuració de la font pot declarar un hint inequívoc. És el mecanisme
  // que farà servir feedsConfig per a NASA, ESO i les missions ESA.
  const configuredTopic = String(story?.sourceTopic || '').trim()
  if (ALLOWED_EDITORIAL_TOPIC_SET.has(configuredTopic)) return configuredTopic

  // Defensa en profunditat de la configuració: aquestes fonts de Circuit B
  // humanístiques tenen un àmbit editorial estable i no depenen del vocabulari
  // variable del titular o de l'editor que l'hagi preparat.
  if (story?.circuit === 'B' || story?.sourceCircuit === 'B') {
    const matchedHumanitiesSource = HUMANITIES_CIRCUIT_B_SOURCES.find(
      ({ pattern }) => pattern.test(sourceText(story)),
    )
    if (matchedHumanitiesSource) return matchedHumanitiesSource.topic
  }

  // Sense un hint, les fonts astronòmiques de Circuit A tenen una assignació
  // segura. PLOS i NIH no es forcen: es resolen pel contingut, perquè cobreixen
  // tant biotecnologia/ciència com, en el cas del NIH, longevitat.
  if (
    isCircuitA(story) &&
    ASTRONOMY_CIRCUIT_A_SOURCES.some((pattern) => pattern.test(sourceText(story)))
  ) {
    return 'Astronomia'
  }
  return null
}

function textForTopicAssignment(story) {
  const category = String(story?.category || '').trim()
  const material = STRICTLY_OUTSIDE_TOPIC_CATEGORIES.has(category)
    ? [story?.title]
    : [
        category,
        story?.title,
        story?.summary,
        story?.sourceContext,
        story?.impact,
      ]
  return material.filter(Boolean).join(' ')
}

// Assignació NOMÉS per a peces entrants (radar, feeds configurats o redacció).
// No s'utilitza per reclassificar llegats ja desats: aquests només entren a un
// tema si una editora els afegeix `topic` explícitament.
export function assignEditorialTopic(story) {
  const explicitTopic = String(story?.topic || '').trim()
  if (ALLOWED_EDITORIAL_TOPIC_SET.has(explicitTopic)) return explicitTopic

  const sourceTopic = sourceAssignedTopic(story)
  if (sourceTopic) return sourceTopic

  const text = textForTopicAssignment(story)
  const humanistic = isHumanitiesContext(story)
  for (const topic of EDITORIAL_TOPIC_TIEBREAK_ORDER) {
    // Filosofia i Literatura NOMÉS per context humanístic (14-08-2026).
    //
    // Les seves paraules clau són massa comunes en textos científics i
    // sanitaris, i produïen classificacions falses de manual:
    //   · "novel drug class" → Literatura, perquè "novel" hi és com a adjectiu
    //     anglès i la regla el llegia com a "novel·la".
    //   · "medical ethics" dins d'una peça sanitària → Filosofia, per "ethics".
    //
    // Les fonts humanístiques (Psyche, Aeon, Literary Hub, Public Domain
    // Review) NO passen per aquí: ja les resol `sourceAssignedTopic` més
    // amunt, i aquell mapatge queda intacte.
    if (TOPICS_ONLY_IN_HUMANITIES.has(topic) && !humanistic) continue
    const rule = ALLOWED_TOPIC_CONTENT_RULES.find((item) => item.topic === topic)
    if (rule?.rx.test(text)) return topic
  }
  return null
}

// Consulta de la taxonomia pública: només llegeix el topic que una peça ja
// porta desat. Això impedeix reclassificar retrospectivament l'hemeroteca.
export function classifyAllowedEditorialTopic(story) {
  const topic = String(story?.topic || '').trim()
  return ALLOWED_EDITORIAL_TOPIC_SET.has(topic) ? topic : null
}

export function keepAllowedEditorialTopic(story) {
  const topic = assignEditorialTopic(story)
  // La categoria canònica continua descrivint la família d'ingesta (p. ex.
  // Salut o Cultura); `topic` és la classificació pública, més específica.
  return topic ? { ...story, topic } : null
}

export function keepArchiveStory(story) {
  const topic = classifyAllowedEditorialTopic(story)
  return topic ? { ...story, topic } : { ...story }
}
