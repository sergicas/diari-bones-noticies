// Radar en viu de bondiari.com: combina el scraping de 3cat amb una vintena
// de RSS catalans, espanyols, anglosaxons i europeus, aplica filtres
// editorials per idioma i guarda el resultat a Workers KV (env.LIVE_NEWS_KV).

import { LIVE_EDITORIAL_VERSION } from '../lib/editorial-version.js'
import { normalizeCategory } from '../lib/category.js'

export const refreshIntervalMs = 4 * 60 * 60 * 1000

const cacheKey = 'latest'
const maxLiveStoryAgeMs = 60 * 24 * 60 * 60 * 1000
const liveEditorialVersion = LIVE_EDITORIAL_VERSION
const targetStoryLimit = 30
const maxStoriesPerSource = 5
const collectionPoolSize = 80

const sections = [
  { url: 'https://www.3cat.cat/3catinfo/politica/', category: 'Política' },
  { url: 'https://www.3cat.cat/3catinfo/societat/', category: 'Societat' },
  { url: 'https://www.3cat.cat/3catinfo/cultura/', category: 'Cultura' },
  { url: 'https://www.3cat.cat/3catinfo/esports/', category: 'Esports' },
  { url: 'https://www.3cat.cat/3catinfo/salut/', category: 'Salut' },
  { url: 'https://www.3cat.cat/3catinfo/medi-ambient/', category: 'Medi ambient' },
  { url: 'https://www.3cat.cat/3catinfo/ciencia-i-tecnologia/', category: 'Món digital' },
]

const rssFeeds = [
  // Catalanes
  { name: 'Vilaweb', url: 'https://www.vilaweb.cat/feed/', language: 'ca', defaultCategory: 'Actualitat' },
  { name: 'ARA', url: 'https://www.ara.cat/rss/', language: 'ca', defaultCategory: 'Actualitat' },
  { name: 'El Punt Avui', url: 'https://www.elpuntavui.cat/?format=feed&type=rss', language: 'ca', defaultCategory: 'Actualitat' },
  { name: 'Betevé', url: 'https://beteve.cat/feed/', language: 'ca', defaultCategory: 'Barcelona' },
  { name: 'Crític', url: 'https://www.elcritic.cat/feed', language: 'ca', defaultCategory: 'Periodisme' },
  { name: 'Nació Digital', url: 'https://www.naciodigital.cat/rss/', language: 'ca', defaultCategory: 'Actualitat' },

  // Castellà
  { name: 'La Vanguardia', url: 'https://www.lavanguardia.com/rss/home.xml', language: 'es', defaultCategory: 'Espanya' },
  { name: 'El País', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', language: 'es', defaultCategory: 'Espanya' },
  { name: 'elDiario', url: 'https://www.eldiario.es/rss/', language: 'es', defaultCategory: 'Espanya' },
  { name: 'RTVE', url: 'https://www.rtve.es/rss/temas_noticias.xml', language: 'es', defaultCategory: 'Espanya' },

  // Feeds PER SECCIÓ per alimentar Cultura/Tecnologia/Ciència (els de 3cat van
  // quedar trencats el 2026: ara són pàgines HTML, no RSS). Aquests sí que
  // donen inflow constant a les seccions que abans es quedaven seques.
  { name: 'El País Cultura', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/cultura/portada', language: 'es', defaultCategory: 'Cultura', forceCategory: true },
  { name: 'El País Tecnologia', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada', language: 'es', defaultCategory: 'Tecnologia', forceCategory: true },
  { name: 'El País Ciència', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada', language: 'es', defaultCategory: 'Ciència', forceCategory: true },
  { name: 'ARA Cultura', url: 'https://www.ara.cat/rss/cultura', language: 'ca', defaultCategory: 'Cultura', forceCategory: true },

  // Anglès — diaris internacionals
  { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'CNN', url: 'http://rss.cnn.com/rss/edition.rss', language: 'en', defaultCategory: 'Món' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', language: 'en', defaultCategory: 'Món' },
  { name: 'Wall Street Journal', url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'Washington Post', url: 'https://feeds.washingtonpost.com/rss/world', language: 'en', defaultCategory: 'Món' },
  { name: 'New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/news.rss', language: 'en', defaultCategory: 'Economia' },
  { name: 'Financial Times', url: 'https://www.ft.com/world?format=rss', language: 'en', defaultCategory: 'Economia' },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', language: 'en', defaultCategory: 'Tecnologia' },
  { name: 'The Conversation', url: 'https://theconversation.com/articles.atom', language: 'en', defaultCategory: 'Coneixement' },

  // Europa altres llengües
  { name: 'Le Monde', url: 'https://www.lemonde.fr/rss/une.xml', language: 'fr', defaultCategory: 'Europa' },
  { name: 'Deutsche Welle', url: 'https://rss.dw.com/xml/rss-en-all', language: 'en', defaultCategory: 'Europa' },
  { name: 'Euronews', url: 'https://www.euronews.com/rss?level=theme&name=news', language: 'en', defaultCategory: 'Europa' },
]

// --- Diccionaris editorials per idioma -------------------------------------

const editorialDictionaries = {
  ca: {
    positive: [
      'èxit', 'recupera', 'recuperen', 'aconsegueix', 'aconsegueixen',
      'ajuda', 'ajuden', 'solidaritat', 'solidari', 'solidària',
      'millora', 'milloren', 'estrena', 'estrenen', 'guanya', 'guanyen',
      'creix', 'creixen', 'pioner', 'pionera', 'avança', 'avancen',
      'acollida', 'acolliment', 'renaixement', 'ajut', 'donació', 'salva',
      'salven', 'premi', 'premiat', 'premiada', 'protecció', 'protegeix',
      'protegeixen', 'restaura', 'restauren', 'rehabilita', 'rehabiliten',
      'gratuït', 'gratuïta', 'inclusió', 'inclusiu', 'inclusiva',
      'referent', 'voluntari', 'voluntària', 'voluntariat',
      'neix', 'neixen', 'celebra', 'celebren', 'inaugura', 'inauguren',
      'descobreix', 'descoberta', 'descobreixen', 'rècord', 'fita',
      'reconeix', 'reconegut', 'reconeguda', 'reconeixement', 'homenatge',
      'guardó', 'guardonat', 'guardonada', 'iniciativa', 'projecte',
      'recerca', 'consolida', 'compromís', 'obre', 'obren', 'reobre',
      'esperança', 'innovació', 'innovador', 'innovadora', 'cooperació',
      'col·laboració', 'sostenible', 'sostenibilitat', 'transforma',
      'transformació', 'amplia', 'amplien', 'arriba', 'reviu', 'reviuen',
      'positiu', 'positiva', 'històric', 'històrica',
      'aprova', 'aprovat', 'aprovada', 'aprovació',
      'aporta', 'aporten', 'aposta', 'aposten',
      // Cultura i ciència (contingut constructiu que sovint no diu "guanya"):
      'exposició', 'novel·la', 'pel·lícula', 'llibre', 'museu', 'festival',
      'concert', 'estudi', 'troballa', 'mostra', 'documental', 'biografia',
      'poemari', 'disc', 'retrospectiva', 'estrena', 'recital',
      'nobel', 'avenç', 'invent', 'patent', 'vacuna', 'renovable', 'prototip',
    ],
    negative: [
      'abus', 'acusaci', 'assassinat', 'addicci', 'budells', 'càncer',
      'clandest', 'confinament', 'contaminaci', 'corrup', 'desnonament',
      'detenen', 'detingut', 'denuncia', 'denunci', 'destru', 'derrota',
      'exhum', 'escàndol', 'fracàs', 'fracas', 'fuita', 'greu', 'guitza',
      'guerra', 'explota', 'emergència', 'incendi', 'investiguen',
      'l’altra cara', "l'altra cara", 'llistes d’espera', "llistes d'espera",
      'mala gestió', 'massificaci', 'mort', 'mor ', 'mosquit', 'panerola',
      'pelotazo', 'pelotazos', 'perdem el control', 'problema mèdic',
      'prohibeix', 'rebuig', 'residual', 'residu', 'pesta', 'presó',
      'robatori', 'sospitos', 'tremol', 'vampir', 'víctima', 'vaga',
      'violència', 'odi', 'atemptat', 'terrorisme', 'terrorista',
      // Successos i delinqüència (paral·lel al castellà).
      'atracament', 'atracaments', 'furt', 'furts', 'delicte', 'delictiu',
      'lladre', 'lladres', 'criminal', 'estafa',
      // Actualitat tensa que no és "bona notícia": trucades d'emergència
      // filtrades i política d'exclusió/odi (casos colats el 15/06/2026).
      'al 112', 'desesperació', 'extrema dreta', 'fonamentalisme',
      'delinqu', 'xenof', 'xenòf',
      // Política de conflicte/insult, jutjats i sancions (colats el 17/06).
      'covard', 'no és demòcrata', 'frau de llei', 'audiència nacional',
      'detindr', 'detencions', 'sancions', 'rússia', 'escalfament',
      'més càlid', 'cobejada', 'imputaci',
      // Verbs de mort i agressió (els substantius ja hi eren)
      'matar', 'mata ', 'maten ', 'matada', 'matades', 'matat', 'matats',
      'assassina ', 'assassinen', 'apunyala', 'apunyalen', 'apunyalat',
      'a trets', 'a punyalades', 'pallissa', 'agredeix', 'agredeixen',
      'agredit', 'agredida', 'segresta', 'segresten', 'segrestat',
      // Mercat esportiu, publicitat i contingut patrocinat
      'fitxatge', 'fitxa per', 'fitxar per', 'es querella', 'querella',
      'rebaixes', 'descomptes', 'oferta del dia', 'pòdcast',
      'contingut patrocinat', 'patrocinat per',
      // Opinió comercial vestida de notícia
      'que ens convida a', 'columna d’opinió', 'columna d\'opinió',
    ],
  },
  es: {
    positive: [
      'éxito', 'recupera', 'recuperan', 'logra', 'logran', 'consigue',
      'consiguen', 'ayuda', 'ayudan', 'solidaridad', 'solidario',
      'solidaria', 'mejora', 'mejoran', 'estrena', 'estrenan', 'gana',
      'ganan', 'crece', 'crecen', 'pionero', 'pionera', 'avanza',
      'avanzan', 'acoge', 'acogida', 'donación', 'salva', 'salvan',
      'premio', 'premiado', 'premiada', 'protege', 'protegen', 'restaura',
      'restauran', 'rehabilita', 'rehabilitan', 'gratuito', 'gratuita',
      'inclusión', 'inclusivo', 'inclusiva', 'referente', 'voluntario',
      'voluntaria', 'voluntariado', 'nace', 'nacen', 'celebra', 'celebran',
      'inaugura', 'inauguran', 'descubre', 'descubren', 'descubrimiento',
      'récord', 'hito', 'reconoce', 'reconocido', 'reconocida',
      'reconocimiento', 'homenaje', 'galardón', 'galardonado',
      'galardonada', 'iniciativa', 'proyecto', 'investigación',
      'consolida', 'compromiso', 'abre', 'abren', 'reabre', 'esperanza',
      'innovación', 'innovador', 'innovadora', 'cooperación',
      'colaboración', 'sostenible', 'sostenibilidad', 'transforma',
      'transformación', 'amplía', 'amplían', 'llega', 'llegan', 'revive',
      'reviven', 'positivo', 'positiva', 'histórico', 'histórica',
      'aprueba', 'aprobado', 'aprobada', 'aprobación', 'aporta',
      'aportan', 'apuesta', 'apuestan',
      // Cultura y ciencia (contenido constructivo sin "gana/récord"):
      'exposición', 'novela', 'película', 'libro', 'museo', 'festival',
      'concierto', 'estudio', 'hallazgo', 'muestra', 'documental', 'biografía',
      'poemario', 'disco', 'retrospectiva', 'resucita', 'recital',
      'nobel', 'avance', 'invento', 'patente', 'vacuna', 'renovable', 'prototipo',
    ],
    negative: [
      'abuso', 'asesinato', 'asesina', 'adicción', 'ataque', 'ataques',
      'atacan', 'atacó', 'atacaron', 'cárcel', 'clandestino',
      'confinamiento', 'contaminación', 'corrupción', 'desalojo',
      'detienen', 'detenido', 'denuncia', 'denuncian', 'destruye',
      'derrota', 'exhuma', 'escándalo', 'fracaso', 'fuga', 'grave',
      'gravísimo', 'guerra', 'explota', 'emergencia', 'incendio',
      'investigan', 'juzgado', 'lista de espera', 'mala gestión',
      'masificación', 'muerte', 'muere', 'mosquito', 'perdemos el control',
      'prohíbe', 'rechazo', 'residual', 'residuos', 'peste', 'cárcel',
      'robo', 'sospecha', 'sospechoso', 'terremoto', 'vampiro', 'víctima',
      'huelga', 'violencia', 'odio', 'atentado', 'terror', 'terrorista',
      'narcotráfico', 'narco', 'mafia', 'cartel', 'asalto', 'tiroteo',
      'masacre', 'genocidio', 'matar', 'mata ', 'matan', 'mató',
      // Successos i delinqüència (faltaven variants: cas "banda del Vaticano").
      // Evitem 'atraca/atracar' perquè també vol dir amarrar un vaixell.
      'atraco', 'atracos', 'atracaron', 'delito', 'delitos', 'delictiv',
      'hurto', 'hurtos', 'criminal', 'ladrón', 'ladrones', 'estafa', 'robaron',
      // Actualitat tensa: emergències filtrades i política d'exclusió/odi.
      'extrema derecha', 'fundamentalismo', 'delincu', 'delinqu', 'xenófob',
      'xenofob', 'desesperación',
      // Política de conflicto/insulto, juzgados y sanciones.
      'cobarde', 'no es un demócrata', 'no es demócrata', 'fraude de ley',
      'audiencia nacional', 'sanciones', 'rusia', 'calentamiento',
      // Mercat esportiu (fichajes), publicitat i contingut patrocinat
      'fichaje', 'fichajes', 'ficha por', 'fichar por', 'fichado por',
      'millones por', 'millones de euros por', 'traspaso de',
      'horarios de los partidos', 'horarios partidos', 'cuándo juega',
      'querella', 'querellan', 'se querelle', 'querellarse',
      'descuentos más', 'los descuentos', 'ofertas del día',
      'oferta del día', 'mejores ofertas', 'rebajas de', 'rebajas en',
      'patrocinado', 'patrocinada', 'contenido patrocinado',
      'podcast', 'podcasts', 'el más vendido', 'los más vendidos',
      'compra al mejor', 'oferta amazon', 'amazon prime day',
      'imputado', 'imputados', 'imputada', 'imputadas',
    ],
  },
  en: {
    positive: [
      'success', 'succeeds', 'achievement', 'achieves', 'helps', 'help ',
      'solidarity', 'improves', 'opens', 'wins', 'won ', 'grows', 'grown',
      'pioneer', 'pioneering', 'advances', 'welcomes', 'breakthrough',
      'donation', 'saves', 'rescue', 'rescued', 'prize', 'award',
      'awarded', 'protects', 'restores', 'restored', 'rehabilitates',
      'free of charge', 'inclusion', 'inclusive', 'volunteer', 'born',
      'celebrates', 'inaugurates', 'discovers', 'discovery', 'record',
      'milestone', 'recognized', 'recognised', 'recognition', 'tribute',
      'initiative', 'project', 'research', 'consolidates', 'commitment',
      'reopen', 'reopens', 'hope', 'hopeful', 'innovation', 'innovative',
      'cooperation', 'collaboration', 'sustainable', 'sustainability',
      'transforms', 'expands', 'arrives', 'revives', 'positive',
      'historic', 'approves', 'approved', 'approval', 'contributes',
      'launches', 'launched', 'celebrated', 'partnership', 'partnerships',
      'recovery', 'recovers',
      // Culture and science (constructive content without "wins/record"):
      'exhibition', 'novel', 'film', 'book', 'museum', 'festival', 'concert',
      'study', 'discovery', 'documentary', 'biography', 'retrospective',
      'nobel', 'patent', 'invention', 'vaccine', 'renewable', 'prototype',
    ],
    negative: [
      'war', 'wars', 'killed', 'kills', 'killing', 'killings', 'death',
      'deaths', 'died', 'attack', 'attacks', 'attacked', 'terrorist',
      'terror', 'missile', 'missiles', 'bombing', 'bombed', 'bomb ',
      'drone strike', 'fatal', 'fatalities', 'deadly', 'crisis',
      'victim', 'victims', 'hostage', 'hostages', 'assault', 'raid ',
      'raids', 'massacre', 'genocide', 'abuse', 'abuses', 'addiction',
      'scandal', 'corrupt', 'corruption', 'scam', 'fraud', 'eviction',
      'destroy', 'destroyed', 'destruction', 'defeat', 'failure',
      'leak', 'leaks', 'severe', 'explodes', 'emergency', 'fire ',
      'wildfire', 'jail', 'prison', 'illegal', 'plague', 'robbery',
      'suspect', 'earthquake', 'strike action', 'violence', 'violent',
      'hate', 'hateful', 'narco', 'mafia', 'cartel', 'overdose',
      'riot', 'riots', 'unrest', 'clash', 'clashes', 'hijack', 'shot dead',
      'shooting', 'shootings', 'stab', 'stabbing', 'invasion', 'invaded',
      'heist', 'burglary', 'burglar', 'theft', 'thief', 'thieves',
      'mugging', 'looting',
      // Tense politics / smears that aren't constructive news.
      'smear', 'smears', 'marred', 'slur', 'slurs', 'far-right',
      'exploit', 'exploits', 'sanctions', 'tax break',
      'strikes on', 'airstrike', 'air strike', 'lebanon', 'gaza', 'live updates',
      'troops', 'crashes', 'crashed', 'tragedy', 'tragic', 'famine',
      'starvation', 'epidemic', 'pandemic', 'outbreak',
      // Sports transfers, advertising, sponsored podcast content
      'transfer', 'transfers', 'transfer market', 'transfer talk',
      'transfer rumours', 'transfer rumors', 'signs for', 'signs with',
      'million bid', 'bid for', 'reject bid',
      'lawsuit', 'lawsuits', 'sued', 'suing', 'sues',
      'podcast', 'podcasts', 'on strategy', 'on growth', 'on alpha',
      'on geopolitics', 'on tech', 'on the economy',
      'sponsor content', 'sponsored content', 'branded content',
      'advertorial', 'sponsored by',
      'best deals', 'top deals', 'deal of the day', 'today’s deals',
      "today's deals", 'best discounts', 'amazon prime day',
      'black friday deals', 'cyber monday',
    ],
  },
  fr: {
    positive: [
      'succès', 'réussit', 'réussite', 'aide', 'solidarité', 'améliore',
      'gagne', 'gagnent', 'croît', 'pionnier', 'pionnière', 'avance',
      'accueil', 'don', 'prix', 'protection', 'protège', 'restaure',
      'gratuit', 'gratuite', 'inclusion', 'volontaire', 'naît',
      'naissance', 'célèbre', 'inaugure', 'découverte', 'découvre',
      'record', 'reconnaissance', 'hommage', 'initiative', 'projet',
      'recherche', 'consolide', 'espoir', 'innovation', 'innovant',
      'coopération', 'collaboration', 'durable', 'transforme', 'élargit',
      'arrive', 'positif', 'positive', 'historique', 'approuve', 'apporte',
      'parie', 'lance', 'sauve', 'sauvent',
    ],
    negative: [
      'guerre', 'mort', 'morts', 'tué', 'tués', 'tue ', 'attaque',
      'attaques', 'victime', 'victimes', 'attentat', 'terreur',
      'terroriste', 'violence', 'violent', 'crise', 'agression',
      'mafia', 'prison', 'scandale', 'corruption', 'fraude', 'expulsion',
      'incendie', 'urgence', 'drame', 'dramatique', 'ravage', 'séisme',
      'grève', 'haine', 'raid', 'meurtre', 'fusillade', 'explosion',
      'catastrophe', 'tragique', 'tragédie', 'invasion', 'famine',
      'braquage', 'cambriolage', 'voleur', 'escroquerie', 'délit', 'criminel',
      'extrême droite', 'délinqu', 'xénophob',
      // Verbes de mort, violence, fin brutale
      'tue ', 'tué', 'tués', 'tuent', 'achève', 'achevé', 'liquide',
      'poignardé', 'poignardée', 'agresse', 'agressé', 'agression',
      // Marché des transferts, publicité, contenu sponsorisé
      'transfert', 'transferts', 'signe à', 'recrute',
      'millions d’euros pour', "millions d'euros pour",
      'plainte', 'porte plainte', 'se porter plainte',
      'soldes', 'promotions', 'meilleures offres', 'bons plans',
      'podcast', 'podcasts', 'contenu sponsorisé', 'parrainé par',
    ],
  },
}

function getDictionary(language) {
  return editorialDictionaries[language] || editorialDictionaries.ca
}

export function passesEditorialFilter(text, language) {
  const normalized = text.toLowerCase()
  const dict = getDictionary(language)
  const isNegative = dict.negative.some((word) => normalized.includes(word))
  const isPositive = dict.positive.some((word) => normalized.includes(word))
  return { isPositive, isNegative, passes: isPositive && !isNegative }
}

// --- Detecció de publicitat encoberta (advertorial) ------------------------

const advertorialUrlPatterns = [
  '/escaparate/', '/smart/', '/icon-design/', '/icon/diseno/',
  '/branded-content/', '/branded/', '/sponsored/', '/sponsor/',
  '/promo/', '/promociones/', '/shopping/', '/shop/',
  '/buyers-guide/', '/buying-guide/', '/deals/',
  '/contenido-patrocinado/', '/publicitat/', '/publicidad/',
  '/podcast/', '/podcasts/', '/audio/', '/radio/podcast',
  '/tienda/', '/comparativa/', '/comparativas/', '/reviews/',
  '/expertos/', '/lo-mejor/', '/lo-mas-vendido/',
  '/contenu-sponsorise/', '/contenu-partenaire/', '/marques/',
  '/quincaillerie/', '/affaires/',
]

const advertorialPhrasePatterns = [
  // Patrons al començament del títol — fórmules típiques de llistes de productes
  /^\s*(els?\s+millors?|las?\s+mejor(?:es)?|los\s+mejores|the\s+best|top\s*\d*|les?\s+meilleur)\b/i,
  /^\s*\d+\s+(productes?|producto?s|products?|coses?|cosas?|things?|raons?|razones?|reasons?|claves?|tips?|marcas?|marques?|brands?|opciones|opcions|formas|formes|maneres|maneras|trucos|trucs|hacks?|secretos|secrets|errores|errors)\b/i,
  /^\s*(once|diez|nueve|ocho|siete|seis|cinco|cuatro|tres|dos|onze|deu|nou|vuit|set|sis|cinc|quatre|tres|dues|ten|nine|eight|seven|six|five|four|three|two)\s+(buenas?|buenos?|mejores|productos?|productes?|marcas?|marques?|brands?|opciones|opcions|cosas|coses|formas|formes|consejos|consells|tips|trucos|trucs|hacks?|secretos|secrets|claves)\b/i,
  // Variant més oberta: "N [paraula] de los mejores" / "N [paraula] para hacer/comprar"
  /^\s*(once|diez|nueve|ocho|siete|seis|cinco|cuatro|tres|dos|onze|deu|nou|vuit|set|sis|cinc|quatre|tres|dues|ten|nine|eight|seven|six|five|four|three|two|\d+)\s+\w+\s+(de\s+los\s+mejores|de\s+les\s+millors|of\s+the\s+best|para\s+(hacer|preparar|comprar|regalar|disfrutar|tener|tu)|para\s+hacer\s+en\s+casa|to\s+(make|buy|gift)|pour\s+(faire|acheter|offrir))\b/i,
  // Opinió signada al títol — "..., por Nom Cognom" o ": por Nom Cognom"
  /[,:]\s*por\s+[A-ZÀ-Ý][\wÀ-ÿ.]+\s+[A-ZÀ-Ý][\wÀ-ÿ.]+(\s+[A-ZÀ-Ý][\wÀ-ÿ.]+)?\s*$/u,
  /[,:]\s*by\s+[A-ZÀ-Ý][\wÀ-ÿ.]+\s+[A-ZÀ-Ý][\wÀ-ÿ.]+\s*$/u,
  /[,:]\s*per\s+[A-ZÀ-Ý][\wÀ-ÿ.]+\s+[A-ZÀ-Ý][\wÀ-ÿ.]+\s*$/u,
  /[,:]\s*par\s+[A-ZÀ-Ý][\wÀ-ÿ.]+\s+[A-ZÀ-Ý][\wÀ-ÿ.]+\s*$/u,
  // Consum/luxe/marca dins esports — patrons típics de cobertura comercial
  /\b(precios\s+(disparados|desorbitados|por\s+las\s+nubes)|preus\s+(disparats|per\s+les\s+núvols)|sky[\s-]?high\s+prices|prix\s+exorbitants)\b/i,
  /\b(opulencia|opulence|despilfarro|fastuoso|fastuosa|luxury\s+lifestyle|lifestyle\s+de\s+luxo)\b/i,
  // Catalogación promocional de places, restaurants, hotels, etc.
  /\b(las|los|els|les|the|les)\s+\d+\s+(restaurantes?|restaurants?|hoteles?|hotels?|playas?|platges?|beaches|destinos|destinacions|destinations|lugares?|llocs?|places?|sitios|llocs)\s+(que|para|que\s+debes|m[ée]s|imperdibl|imprescindibl|m[áa]s\s+bonit)/i,
  // Patrons de "què comprar / quina X triar"
  /\b(qu[èe])\s+(productos?|productes?|marcas?|marques?|m[oó]vil|portátil|crema|zapatos?|tienda|electrod[oó]m|televisor|aspiradora|cafetera|colchón)\b/i,
  /\b(quin[as]?)\s+(producte|marca|m[òo]bil|port[àa]til|crema|sabata|televisor|aspiradora|cafetera|matalàs)\b/i,
  /\bgu[íi]a\s+de\s+compra\b/i,
  /\bbuy(?:er'?s|ing)\s+guide\b/i,
  /\bguide\s+d'?achat\b/i,
  // Patrons d'opinió experta com a venda
  /\bseg[uú]n\s+(los|las)\s+(expertos|expertas|derma|m[eé]dicos)/i,
  /\baccording\s+to\s+(experts|dermatologists|doctors)/i,
  /\bselon\s+les\s+(experts|sp[eé]cialistes)/i,
  // Tags comercials
  /\b(el|la)\s+m[áa]s\s+(vendid|recomendad|valorad)/i,
  /\bbest[\s-]?selling\b/i, /\btop[\s-]?rated\b/i,
  /\bmost\s+recommended\b/i, /\bhighly\s+recommended\b/i,
  /\bmust[\s-]?(have|see|try)\b/i, /\bimprescindible\b/i,
  /\bindispensable[s]?\b/i, /\bincontournable[s]?\b/i,
  // "Presenta el nou / Llança el nou..."
  /\b(presenta|llan[çc]a|lanza|estrena|launches|unveils|d[ée]voile|pr[eé]sente)\s+(su|el|la|its|le|la|son|sa)\s+(nuevo|nueva|new|nouveau|nouvelle|nou|nova)/i,
  /\b(llega|arriba|arrive|hits|comes|lanza|llan[çc]a|presenta)\s+(al\s+mercado|al\s+mercat|to\s+market|sur\s+le\s+march[eé])/i,
  /\bnow\s+(in\s+stock|available)\b/i,
  // Bloomberg-style podcast titles "X on Y" o "X On Y Alpha"
  /\bon\s+(strategy|growth|geopolitics|tech|the\s+economy|alpha|markets|the\s+brink|trade)\b/i,
  /\bon\s+\w+\s+alpha\b/i,
  /\bbloomberg\s+(surveillance|opinion|tech)\b/i,
  // Black Friday / Cyber Monday / Prime Day
  /\b(black\s+friday|cyber\s+monday|prime\s+day|amazon\s+prime\s+day)\b/i,
  // "El X de [Marca]" amb verb comercial
  /\b(amazon|el\s+corte\s+ingl[eé]s|inditex|zara|mercadona|mango|decathlon|carrefour|fnac|media\s+markt)\s+(ofrece|presenta|lanza|estrena|propone|ofreix|llança|estrena)\b/i,
  // Reportatges que recomanen restaurants/hotels com a publi
  /\b(el|la|los|las|els|les)\s+(restaurante?s?|restaurants?|hoteles?|hotels?)\s+(que\s+no\s+(?:te\s+)?pued|que\s+debes\s+visitar|imprescindibl|imperdibl|secret)/i,
]

export function looksLikeAdvertorial({ url, title, summary }) {
  const lowerUrl = String(url || '').toLowerCase()
  if (advertorialUrlPatterns.some((pattern) => lowerUrl.includes(pattern))) {
    return true
  }
  const titleText = String(title || '')
  const summaryText = String(summary || '')
  const combinedText = `${title || ''} ${summary || ''}`
  return advertorialPhrasePatterns.some((re) => {
    // Patrons ancorats a fi de cadena ($) s'apliquen al títol i al summary
    // per separat, perquè un "..., per X Y" pot estar només al subtítol.
    if (re.source.includes('$')) {
      return re.test(titleText) || re.test(summaryText)
    }
    return re.test(combinedText)
  })
}

// Sostre per font: cap diari pot dominar més de N peces del lot final.
// Mantenim l'ordre original i fem servir el sobrant com a omplerta si la
// primera passada no arriba al volum desitjat.
export function applyDiversityCap(stories, maxPerSource, targetTotal) {
  const counts = new Map()
  const primary = []
  const overflow = []
  for (const story of stories) {
    const source = story.source || '—'
    const count = counts.get(source) || 0
    if (count < maxPerSource) {
      primary.push(story)
      counts.set(source, count + 1)
    } else {
      overflow.push(story)
    }
  }
  if (primary.length >= targetTotal) {
    return primary.slice(0, targetTotal)
  }
  return [...primary, ...overflow].slice(0, targetTotal)
}

// --- Utilitats compartides -------------------------------------------------

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtmlEntities(value) {
  if (!value) return ''
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function detectLocation(text) {
  if (text.includes('mataró') || text.includes('maresme')) return 'Mataró, Maresme'
  if (text.includes('barcelona') || text.includes('bcn')) return 'Barcelona, Catalunya'
  if (text.includes('girona')) return 'Girona, Catalunya'
  if (text.includes('lleida')) return 'Lleida, Catalunya'
  if (text.includes('tarragona')) return 'Tarragona, Catalunya'
  if (text.includes('reus')) return 'Reus, Catalunya'
  if (text.includes('catalunya') || text.includes('català')) return 'Catalunya'
  if (text.includes('madrid')) return 'Madrid'
  if (text.includes('sevilla')) return 'Sevilla'
  if (text.includes('españa') || text.includes('spain')) return 'Espanya'
  if (text.includes('london') || text.includes('londres')) return 'Londres'
  if (text.includes('paris') || text.includes('parís')) return 'París'
  if (text.includes('berlin') || text.includes('berlín')) return 'Berlín'
  if (text.includes('washington')) return 'Washington'
  if (text.includes('new york') || text.includes('nova york')) return 'Nova York'
  if (text.includes('europe') || text.includes('europa')) return 'Europa'
  return 'Món'
}

// --- 3cat: scraping de seccions amb __NEXT_DATA__ --------------------------

function getImageUrl(item) {
  return (
    asArray(item.imatges).find((image) => image?.text)?.text?.trim() ||
    item.thumbnail ||
    ''
  )
}

function getStoryUrl(item) {
  if (item.url) {
    return item.url.startsWith('http')
      ? item.url
      : `https://www.3cat.cat${item.url}`
  }
  const slug = slugify(item.permatitle || item.titol)
  if (!slug || !item.id) return ''
  return `https://www.3cat.cat/3catinfo/${slug}/noticia/${item.id}/`
}

function parseCatalanDate(value) {
  const match = String(value || '').match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/,
  )
  if (!match) return ''
  const [, day, month, year, hour, minute, second = '00'] = match
  return new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}+02:00`,
  ).toISOString()
}

function extractNextData(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  )
  if (!match) return null
  return JSON.parse(match[1])
}

function collectThemeItems(value, results = []) {
  if (!value || typeof value !== 'object') return results
  if (Array.isArray(value)) {
    for (const item of value) collectThemeItems(item, results)
    return results
  }
  if (value.id && value.titol && value.entradeta && getImageUrl(value)) {
    results.push(value)
  }
  for (const child of Object.values(value)) collectThemeItems(child, results)
  return results
}

function normalizeThreeCatStory(item, section) {
  const title = stripHtml(item.titol || item.permatitle)
  const description = stripHtml(item.entradeta || title)
  const link = getStoryUrl(item)
  const imageUrl = getImageUrl(item)
  const publishedAt = parseCatalanDate(
    item.data_publicacio || item.data_modificacio,
  )
  if (!title || !link || !imageUrl || !publishedAt) return null

  const fullText = `${title} ${description}`
  const summarySnippet = `${description.slice(0, 180)}${description.length > 180 ? '...' : ''}`
  if (looksLikeAdvertorial({ url: link, title, summary: summarySnippet })) return null
  const { passes, isPositive } = passesEditorialFilter(fullText, 'ca')
  if (!passes) return null

  return {
    title,
    category: section.category,
    location: detectLocation(fullText.toLowerCase()),
    summary: summarySnippet,
    impact:
      'El radar automàtic l’ha detectada com a notícia constructiva de proximitat.',
    source: '3CatInfo',
    language: 'ca',
    url: link,
    imageUrl,
    imageAlt: `Imatge de portada per a ${title}.`,
    imageCredit: '3CatInfo',
    imageAttributionUrl: link,
    editorialScore: isPositive ? 1 : 0,
    editorialVersion: liveEditorialVersion,
    publishedAt,
  }
}

async function collectSectionStories(section) {
  try {
    const response = await fetch(section.url, {
      headers: {
        accept: 'text/html',
        'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
      },
    })
    if (!response.ok) return { stories: [], candidates: 0 }

    const html = await response.text()
    const nextData = extractNextData(html)
    const pageProps = nextData?.props?.pageProps
    if (!pageProps) return { stories: [], candidates: 0 }

    const items = collectThemeItems(pageProps)
    const stories = items
      .map((item) => normalizeThreeCatStory(item, section))
      .filter(Boolean)
    return { stories, candidates: items.length }
  } catch (error) {
    console.warn(`[radar] 3cat ${section.category} ha fallat`, error)
    return { stories: [], candidates: 0 }
  }
}

// --- Parser RSS / Atom comú ------------------------------------------------

function extractTag(block, tag) {
  const re = new RegExp(
    `<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    'i',
  )
  const match = block.match(re)
  if (!match) return ''
  return match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()
}

function extractAttr(block, tag, attr) {
  const re = new RegExp(
    `<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["'][^>]*\\/?>`,
    'i',
  )
  const match = block.match(re)
  return match ? match[1] : ''
}

function extractAtomLink(block) {
  const re = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i
  const match = block.match(re)
  return match ? match[1] : ''
}

function extractImageFromContent(htmlContent) {
  if (!htmlContent) return ''
  const match = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match ? match[1] : ''
}

function pickImageForItem(block) {
  const mediaThumb = extractAttr(block, 'media:thumbnail', 'url')
  if (mediaThumb) return mediaThumb
  const mediaContent = extractAttr(block, 'media:content', 'url')
  if (mediaContent) return mediaContent
  const enclosure = extractAttr(block, 'enclosure', 'url')
  if (enclosure) return enclosure
  const description = extractTag(block, 'description')
  const fromDesc = extractImageFromContent(description)
  if (fromDesc) return fromDesc
  const contentEncoded = extractTag(block, 'content:encoded')
  const fromContent = extractImageFromContent(contentEncoded)
  if (fromContent) return fromContent
  const summary = extractTag(block, 'summary')
  return extractImageFromContent(summary)
}

function parseRfc822Date(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString()
}

function extractPrimaryCategory(block, fallback) {
  const re = /<category\b[^>]*>([\s\S]*?)<\/category>/gi
  let match
  while ((match = re.exec(block)) !== null) {
    const value = match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()
    if (value) return normalizeCategory(value, fallback)
  }
  return normalizeCategory(null, fallback)
}

function normalizeFeedItem(block, feed) {
  const title = decodeHtmlEntities(stripHtml(extractTag(block, 'title')))
  const linkTag = extractTag(block, 'link')
  const link = decodeHtmlEntities(linkTag || extractAtomLink(block))
  const descriptionHtml = extractTag(block, 'description') || extractTag(block, 'summary') || extractTag(block, 'content')
  const description = decodeHtmlEntities(stripHtml(descriptionHtml))
  const subtitle = decodeHtmlEntities(stripHtml(extractTag(block, 'subtitle')))
  const publishedAt =
    parseRfc822Date(extractTag(block, 'pubDate')) ||
    parseRfc822Date(extractTag(block, 'published')) ||
    parseRfc822Date(extractTag(block, 'updated'))
  const imageUrl = pickImageForItem(block)
  // Per als feeds dedicats a una secció (forceCategory) confiem en la secció
  // del feed, no en l'etiqueta de l'article (que sovint la desvia a Espanya,
  // Salut…). Així Cultura/Tecnologia/Ciència s'omplen de debò.
  const category = feed.forceCategory
    ? feed.defaultCategory
    : extractPrimaryCategory(block, feed.defaultCategory)

  if (!title || !link || !publishedAt || !imageUrl) return null

  const summarySource = subtitle || description || title
  const summarySnippet = `${summarySource.slice(0, 180)}${summarySource.length > 180 ? '...' : ''}`
  if (looksLikeAdvertorial({ url: link, title, summary: summarySnippet })) return null
  const fullText = `${title} ${summarySource}`
  const { passes, isPositive } = passesEditorialFilter(fullText, feed.language)
  if (!passes) return null

  return {
    title,
    category,
    location: detectLocation(fullText.toLowerCase()),
    summary: summarySnippet,
    impact:
      'El radar automàtic l’ha detectada com a notícia constructiva.',
    source: feed.name,
    language: feed.language,
    url: link,
    imageUrl,
    imageAlt: `Imatge de portada per a ${title}.`,
    imageCredit: feed.name,
    imageAttributionUrl: link,
    editorialScore: isPositive ? 1 : 0,
    editorialVersion: liveEditorialVersion,
    publishedAt,
  }
}

async function collectFeedStories(feed) {
  try {
    const response = await fetch(feed.url, {
      headers: {
        accept: 'application/rss+xml, application/xml, application/atom+xml, text/xml, */*',
        'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
      },
    })
    if (!response.ok) return { stories: [], candidates: 0 }
    const xml = await response.text()
    if (!/<rss[\s>]|<feed[\s>]/i.test(xml)) return { stories: [], candidates: 0 }

    const itemRegex = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi
    const stories = []
    let candidates = 0
    let match
    while ((match = itemRegex.exec(xml)) !== null) {
      candidates += 1
      const story = normalizeFeedItem(match[2], feed)
      if (story) stories.push(story)
    }
    return { stories, candidates }
  } catch (error) {
    console.warn(`[radar] Ha fallat el feed ${feed.name}`, error)
    return { stories: [], candidates: 0 }
  }
}

// --- Recol·lecció combinada -----------------------------------------------

export async function collectLivePositiveNews() {
  const [sectionResults, feedResults] = await Promise.all([
    Promise.all(sections.map(collectSectionStories)),
    Promise.all(rssFeeds.map(collectFeedStories)),
  ])

  const stories = []
  let reviewedCount = 0
  for (const result of sectionResults) {
    stories.push(...result.stories)
    reviewedCount += result.candidates
  }
  for (const result of feedResults) {
    stories.push(...result.stories)
    reviewedCount += result.candidates
  }

  const uniqueStories = new Map()
  for (const story of stories) {
    if (!uniqueStories.has(story.url)) {
      uniqueStories.set(story.url, story)
    }
  }

  const filtered = [...uniqueStories.values()]
    .filter(
      (story) =>
        Date.now() - new Date(story.publishedAt).getTime() <= maxLiveStoryAgeMs,
    )
    .sort(
      (left, right) =>
        right.editorialScore - left.editorialScore ||
        new Date(right.publishedAt).getTime() -
          new Date(left.publishedAt).getTime(),
    )
    .map((story) => {
      const publicStory = { ...story }
      delete publicStory.editorialScore
      return publicStory
    })
    .slice(0, collectionPoolSize)

  return { stories: filtered, reviewed: reviewedCount, accepted: filtered.length }
}

async function getCachedPayload(kv) {
  return kv.get(cacheKey, 'json')
}

async function setCachedPayload(kv, stories) {
  const updatedAt = new Date().toISOString()
  const payload = {
    updatedAt,
    nextRefreshAt: new Date(Date.now() + refreshIntervalMs).toISOString(),
    stories,
  }
  await kv.put(cacheKey, JSON.stringify(payload))
  return payload
}

// --- Memòria d'URLs ja servides (perquè cada dia hi hagi peces noves) -----

const seenUrlsKey = 'seen-urls-v1'
const seenUrlsRetentionMs = 14 * 24 * 60 * 60 * 1000
const minFreshStoriesForFullRefresh = 10

async function loadSeenEntries(kv) {
  try {
    const data = await kv.get(seenUrlsKey, 'json')
    return Array.isArray(data?.entries) ? data.entries : []
  } catch (error) {
    console.warn('No s’ha pogut llegir la memòria d’URLs vistes', error)
    return []
  }
}

async function saveSeenEntries(kv, entries) {
  const cutoff = Date.now() - seenUrlsRetentionMs
  const pruned = entries.filter((entry) => Number(entry.firstSeenAt) > cutoff)
  try {
    await kv.put(seenUrlsKey, JSON.stringify({ entries: pruned }))
  } catch (error) {
    console.warn('No s’ha pogut escriure la memòria d’URLs vistes', error)
  }
}

// Comptador editorial mensual: cada passada del cron acumula quantes
// notícies ha revisat (= candidates abans del filtre) i quantes han
// arribat al lot final. Es persisteix per mes natural.

function editorialStatsKeyFor(date = new Date()) {
  const isoMonth = date.toISOString().slice(0, 7) // YYYY-MM
  return `editorial-stats:${isoMonth}`
}

async function updateEditorialStats(kv, { reviewed, published }) {
  const key = editorialStatsKeyFor()
  try {
    const current = (await kv.get(key, 'json')) || { reviewed: 0, published: 0 }
    const next = {
      reviewed: (current.reviewed || 0) + (reviewed || 0),
      published: (current.published || 0) + (published || 0),
      lastUpdatedAt: new Date().toISOString(),
    }
    await kv.put(key, JSON.stringify(next))
  } catch (error) {
    console.warn('No s’ha pogut actualitzar el comptador editorial', error)
  }
}

export async function readEditorialStats(kv) {
  const key = editorialStatsKeyFor()
  try {
    const current = await kv.get(key, 'json')
    return {
      month: key.slice('editorial-stats:'.length),
      reviewed: current?.reviewed || 0,
      published: current?.published || 0,
      lastUpdatedAt: current?.lastUpdatedAt || null,
    }
  } catch (error) {
    return { month: key.slice('editorial-stats:'.length), reviewed: 0, published: 0, lastUpdatedAt: null }
  }
}

// Seccions editorials de poc volum que abans es quedaven seques perquè les
// categories grans (Espanya, Societat…) s'enduien totes les places.
const guaranteedCategories = [
  'Cultura', 'Tecnologia', 'Ciència', 'Salut', 'Medi ambient', 'Educació',
]

// Garanteix que cada secció de la llista, si té alguna peça disponible al
// conjunt, tingui com a mínim una notícia al lot final. Si cal fer lloc, treu
// l'última peça d'una categoria sobre-representada (mai buida una secció).
function ensureCategoryCoverage(capped, pool, limit) {
  const result = [...capped]
  const present = new Set(result.map((s) => s.category))
  for (const cat of guaranteedCategories) {
    if (present.has(cat)) continue
    const candidate = pool.find(
      (s) => s.category === cat && !result.some((r) => r.url === s.url),
    )
    if (!candidate) continue
    if (result.length >= limit) {
      const counts = {}
      result.forEach((s) => { counts[s.category] = (counts[s.category] || 0) + 1 })
      let removeIdx = -1
      for (let i = result.length - 1; i >= 0; i--) {
        if (counts[result[i].category] > 1) { removeIdx = i; break }
      }
      if (removeIdx === -1) continue
      result.splice(removeIdx, 1)
    }
    result.push(candidate)
    present.add(cat)
  }
  return result
}

export async function getLiveNewsPayload(kv, { force = false } = {}) {
  let cached = null
  try {
    cached = await getCachedPayload(kv)
  } catch (error) {
    console.warn('No s’ha pogut llegir la memòria de notícies', error)
  }

  if (!force) {
    const updatedAt = cached?.updatedAt ? new Date(cached.updatedAt).getTime() : 0
    const isFresh = updatedAt && Date.now() - updatedAt < refreshIntervalMs
    if (cached?.stories && isFresh) {
      return { ...cached, cache: 'hit' }
    }
  }

  const { stories: allStories, reviewed: reviewedThisPass } = await collectLivePositiveNews()
  const seenEntries = await loadSeenEntries(kv)
  const seenSet = new Set(seenEntries.map((entry) => entry.url))
  const freshStories = allStories
    .filter((story) => !seenSet.has(story.url))
    .map((story) => ({ ...story, isFresh: true }))
  const freshUrlSet = new Set(freshStories.map((story) => story.url))

  // Cap font ha respost o cap notícia ha passat els filtres → mantenir cache.
  if (allStories.length === 0 && cached?.stories?.length) {
    return { ...cached, cache: 'stale' }
  }

  // Marquem les noves com a "vistes" perquè no tornin demà.
  if (freshStories.length > 0) {
    const now = Date.now()
    const updatedSeen = [
      ...seenEntries,
      ...freshStories.map((story) => ({ url: story.url, firstSeenAt: now })),
    ]
    await saveSeenEntries(kv, updatedSeen)
  }

  // Construïm el lot final i li apliquem el sostre per font (diversitat).
  let preDiversity
  if (freshStories.length >= minFreshStoriesForFullRefresh) {
    // Hi ha prou novetat — el lot és íntegrament nou.
    preDiversity = freshStories
  } else if (cached?.stories?.length) {
    // Poques noves: encapçalem amb les noves i completem amb les del cache anterior
    // (excloent duplicats). Així cada visita té novetat sense quedar-se mai amb
    // una portada curta. Les del cache antic perden l'etiqueta isFresh perquè ja
    // s'havien mostrat a passades anteriors.
    const carryover = cached.stories
      .filter((s) => !freshUrlSet.has(s.url))
      // Revalidem contra el filtre editorial ACTUAL: si l'hem endurit, les
      // peces velles que ara no passen el tall (p. ex. guerra, política tensa)
      // cauen aquí en lloc d'arrossegar-se eternament pel cache.
      .filter((s) => passesEditorialFilter(`${s.title} ${s.summary || ''}`, s.language).passes)
      .map(({ isFresh: _isFresh, ...rest }) => rest)
    preDiversity = [...freshStories, ...carryover]
  } else {
    // Primer cop o sense cache: el que hi hagi, marcat com a fresh (tot és nou).
    preDiversity = allStories.map((story) => ({ ...story, isFresh: true }))
  }
  const finalStories = ensureCategoryCoverage(
    applyDiversityCap(preDiversity, maxStoriesPerSource, targetStoryLimit),
    preDiversity,
    targetStoryLimit,
  )

  try {
    const payload = await setCachedPayload(kv, finalStories)
    await updateEditorialStats(kv, {
      reviewed: reviewedThisPass,
      published: finalStories.length,
    })
    const cacheLabel =
      freshStories.length >= minFreshStoriesForFullRefresh
        ? 'refresh-fresh'
        : freshStories.length > 0
        ? 'refresh-merged'
        : 'refresh-no-new'
    return {
      ...payload,
      cache: cacheLabel,
      freshCount: freshStories.length,
      totalCandidates: allStories.length,
      reviewedThisPass,
    }
  } catch (error) {
    console.warn('No s’ha pogut escriure la memòria de notícies', error)
    const updatedAt = new Date().toISOString()
    return {
      updatedAt,
      nextRefreshAt: new Date(Date.now() + refreshIntervalMs).toISOString(),
      stories: finalStories,
      cache: 'transient',
    }
  }
}
