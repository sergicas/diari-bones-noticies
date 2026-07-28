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
  'astronomy': 'Ciència', 'biology': 'Ciència',

  // Tecnologia
  'tecnologia': 'Tecnologia', 'tecnología': 'Tecnologia',
  'technology': 'Tecnologia', 'tech': 'Tecnologia',
  'món digital': 'Tecnologia', 'mon digital': 'Tecnologia',
  'digital': 'Tecnologia', 'ia': 'Tecnologia', 'ai': 'Tecnologia',
  'intel·ligència artificial': 'Tecnologia',

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
  'Cultura',
  'Esports',
  'Ciència',
  'Tecnologia',
  'Societat',
  'Religió',
  'Solidaritat',
  'Educació',
  'Economia',
  'Política',
]

// Índex públic de la línia temàtica. És compartit pel menú, la portada i
// l'hemeroteca perquè els noms i els enllaços no divergeixin amb el temps.
export const EDITORIAL_TOPIC_INDEX = [
  {
    id: 'cultura',
    label: 'Cultura',
    description: 'Creació, llengua i patrimoni que fan més rica la vida compartida.',
    subtopics: ['Música', 'Literatura', 'Teatre', 'Cinema', 'Arts', 'Patrimoni'],
  },
  {
    id: 'esports',
    label: 'Esports',
    description: 'Esport de base, inclusió, salut i fites col·lectives.',
    subtopics: [],
  },
  {
    id: 'ciencia',
    label: 'Ciència',
    description: 'Recerca i descobertes verificables que amplien el coneixement.',
    subtopics: [],
  },
  {
    id: 'tecnologia',
    label: 'Tecnologia',
    description: 'Eines digitals i innovacions amb una utilitat humana concreta.',
    subtopics: [],
  },
  {
    id: 'societat',
    label: 'Societat',
    description: 'Comunitat, drets, cures i millores en la vida quotidiana.',
    subtopics: [],
  },
  {
    id: 'religio',
    label: 'Religió',
    description: 'Fe, diàleg interreligiós i comunitats que treballen pel bé comú.',
    subtopics: [],
  },
  {
    id: 'solidaritat',
    label: 'Solidaritat',
    description: 'Voluntariat, suport mutu i iniciatives que no deixen ningú enrere.',
    subtopics: [],
  },
  {
    id: 'educacio',
    label: 'Educació',
    description: 'Escoles, aprenentatge i oportunitats formatives amb retorn social.',
    subtopics: [],
  },
  {
    id: 'economia',
    label: 'Economia',
    description:
      'Feina, cooperatives, comerç i indústria quan creen oportunitats o reparteixen millor.',
    subtopics: [],
  },
  {
    id: 'politica',
    label: 'Política',
    description:
      'Govern i institucions quan milloren la vida en comú. El soroll de partit i el conflicte en queden fora.',
    subtopics: [],
  },
]

// Una icona simpàtica per a cada tema. Es fa servir a TOT ARREU on apareix un
// tema: el menú, l'índex, la pàgina del tema i l'etiqueta de cada targeta.
const TOPIC_ICONS = {
  Cultura: '🎭',
  Esports: '⚽',
  Ciència: '🔬',
  Tecnologia: '💡',
  Societat: '🤝',
  Religió: '🕊️',
  Solidaritat: '❤️',
  Educació: '📚',
  Economia: '🌱',
  Política: '🏛️',
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
    topic: 'Cultura',
    rx: allowedTopicPattern(
      'cultur|m[úu]sic|concert|canç[óo]|cantant|orquestr|coral|literatur|llibr|llibre|libro|book|poes|novel·?la|novela|teatre|teatro|theatre|cinema|cine(?:$|[^\\p{L}])|film|documental|museu|museo|museum|exposici|exhibiti|fotografi|pintur|escultur|arts?(?:$|[^\\p{L}])|art[íi]st|patrimoni|patrimonio|heritage|dansa|danza|dance|[òo]pera|festival cultural|c[òo]mic|comic|biblioteca|biblioth[èe]que',
    ),
  },
  {
    topic: 'Esports',
    rx: allowedTopicPattern(
      'esport|deport|sports?(?:$|[^\\p{L}])|f[úu]tbol|football|b[àa]squet|basket|handbol|waterpolo|tennis|tenis|atlet|ciclisme|ciclismo|nataci|swimming|marat[oó]|ol[íi]mpi|paral[íi]mpi|campionat|campeonato|championship|club esportiu|club deportivo',
    ),
  },
  {
    topic: 'Ciència',
    rx: allowedTopicPattern(
      'ci[èe]nci|ciencia|science|cient[íi]fic|scientist|recerca|investigaci[óo]n|research|descoberta|descubrimiento|discovery|astronom|biolog|gen[èe]tic|genetic|genoma|f[òo]ssil|f[óo]sil|fossil|laboratori|laboratorio|laboratory|assaig cl[íi]nic|ensayo cl[íi]nico|clinical trial|estudi m[èe]dic|estudio m[ée]dico|medical study|vacuna|vaccine|tractament experimental|tratamiento experimental',
    ),
  },
  {
    topic: 'Tecnologia',
    rx: allowedTopicPattern(
      'tecnolog|technology|tech(?:$|[^\\p{L}])|intel·lig[èe]ncia artificial|inteligencia artificial|artificial intelligence|(?:IA|AI)(?:$|[^\\p{L}])|digital|programari|software|codi obert|c[óo]digo abierto|open source|rob[oò]tic|robot|ciberseguretat|ciberseguridad|cybersecurity|algoritm|computaci|semiconductor|videojoc|videojuego|video game|aplicaci[óo] m[òo]bil|aplicaci[óo]n m[óo]vil|mobile app',
    ),
  },
  {
    topic: 'Religió',
    rx: allowedTopicPattern(
      'religi|religion|fe(?:$|[^\\p{L}])|faith|esgl[ée]sia|iglesia|church|parr[oò]quia|parroquia|monestir|monasterio|monastery|convent|temple|sinagoga|synagogue|mesquita|mezquita|mosque|cristi|cristian|christian|islam|musulm|muslim|jueu|jud[íi]o|jewish|budis|buddh|interreligi|interfaith|espiritual|spiritual',
    ),
  },
  {
    topic: 'Solidaritat',
    rx: allowedTopicPattern(
      'solidari|solidaridad|solidarity|solidarit[ée]|voluntari|voluntariado|volunteer|b[ée]n[ée]vol|donaci|donation|recapta|recauda|fundrais|banc dels aliments|banco de alimentos|food bank|suport mutu|apoyo mutuo|mutual aid|acollida|acogida|refugi|inclusi[óo] social|ajuda humanit[àa]ria|ayuda humanitaria|humanitarian aid|sense llar|sin hogar|homeless',
    ),
  },
  {
    topic: 'Educació',
    rx: allowedTopicPattern(
      'educaci|education|educaci[óo]n|escola|escuela|school|instituts?(?:$|[^\\p{L}])|institutos?(?:$|[^\\p{L}])|high school|universitat|universidad|university|alumn|estudiant|student|docent|professor|maestr|teacher|aula|classroom|aprenentatge|aprendizaje|learning|formaci[óo]|training|beca|scholarship|biblioteca escolar|alfabetitz|alfabetiz|literacy',
    ),
  },
  {
    topic: 'Economia',
    // Economia CONSTRUCTIVA: activitat econòmica que crea feina o reparteix
    // millor (cooperatives, comerç, indústria, emprenedoria, fàbriques que
    // reobren). S'eviten a posta les paraules de la burocràcia de servei
    // —subvenció, ajut, convocatòria, autònoms, afiliacions, sectors— perquè
    // el Sergi va decidir el diari sense subvencions ni dades de l'Idescat: si
    // hi entressin, aquest tema les tornaria a colar. La borsa i els resultats
    // d'empresa ja els bloqueja abans UNIVERSAL_NEG i el filtre de publireportatge.
    rx: allowedTopicPattern(
      'econom|cooperativ|comer[çc]|comercio|commerce|ind[úu]stri|industria|industry|emprenedor|emprendedor|entrepreneur|emprendimiento|pime(?:$|[^\\p{L}])|pyme|empresa social|social enterprise|llocs de treball|puestos de trabajo|artesan|reindustrialitza|mercat laboral|mercado laboral|f[àa]brica|f[áa]brica|factory|autoocupaci',
    ),
  },
  {
    topic: 'Societat',
    rx: allowedTopicPattern(
      'societat|sociedad|society|social|comunitat|comunidad|community|barri|barrio|neighborhood|ve[iï]n|vecin|resident|fam[íi]li|family|infant|niñ|child|jove|joven|youth|gent gran|personas mayores|older people|ciutadania|ciudadan[íi]a|citizens|conviv[èe]ncia|convivencia|coexistence|accessibilitat|accesibilidad|accessibility|discapacitat|discapacidad|disability|drets humans|derechos humanos|human rights|igualtat|igualdad|equality|salut p[úu]blica|salud p[úu]blica|public health|hospital|reanimaci|resuscitation|servei p[úu]blic|servicio p[úu]blico|public service',
    ),
  },
]

export function classifyAllowedEditorialTopic(story) {
  const category = String(story?.category || '').trim()
  if (ALLOWED_EDITORIAL_TOPIC_SET.has(category)) return category

  // En una peça etiquetada principalment com a política, economia, clima o
  // internacional, una menció incidental a "educació" o "cultura" al resum
  // no la converteix en una notícia d'aquell tema. En aquests casos exigim que
  // l'àmbit autoritzat sigui visible al mateix titular.
  const material = STRICTLY_OUTSIDE_TOPIC_CATEGORIES.has(category)
    ? [story?.title]
    : [
        category,
        story?.title,
        story?.summary,
        story?.sourceContext,
        story?.impact,
      ]
  const text = material
    .filter(Boolean)
    .join(' ')

  for (const rule of ALLOWED_TOPIC_CONTENT_RULES) {
    if (rule.rx.test(text)) return rule.topic
  }
  return null
}

export function keepAllowedEditorialTopic(story) {
  const topic = classifyAllowedEditorialTopic(story)
  return topic ? { ...story, category: topic } : null
}
