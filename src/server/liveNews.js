// Radar en viu de bondiari.com: combina el scraping de 3cat amb una vintena
// de RSS catalans, espanyols, anglosaxons i europeus, aplica filtres
// editorials per idioma i guarda el resultat a Workers KV (env.LIVE_NEWS_KV).

import { LIVE_EDITORIAL_VERSION } from '../lib/editorial-version.js'
import { normalizeCategory } from '../lib/category.js'

export const refreshIntervalMs = 4 * 60 * 60 * 1000

const cacheKey = 'latest'
// El Bon Diari és un DIARI: el radar només manté notícies de pocs dies. Una
// finestra llarga deixava que notícies velles amb moltes paraules positives
// dominessin la portada eternament. 4 dies = prou marge per a seccions lentes
// (ciència, cultura) sense fossilitzar-se. La portada del web encara n'ensenya
// les de < 2 dies; la resta van a l'Hemeroteca.
const maxLiveStoryAgeMs = 4 * 24 * 60 * 60 * 1000
const liveEditorialVersion = LIVE_EDITORIAL_VERSION
const targetStoryLimit = 30
const maxStoriesPerSource = 5
const collectionPoolSize = 80
// Bondiari és un diari de Catalunya. Proporcions OBJECTIU sobre el lot
// (targetStoryLimit = 30): català ~60% (sense sostre: omple la resta de la
// portada), castellà ~20% (6), anglès ~10% (3) i la resta de llengües ~10% en
// conjunt (francès/italià/portuguès, una cadascuna). Així el català domina la
// portada i cap llengua forana no la pot inundar.
const maxStoriesPerLanguage = { es: 6, en: 3, fr: 1, it: 1, pt: 1 }

// Els feeds per secció de 3cat van quedar TRENCATS el 2026 (ara són pàgines
// HTML, no RSS): donaven 0 notícies i malgastaven una subpetició cadascun. Les
// seccions s'alimenten ara dels feeds dedicats de rssFeeds (El País Cultura/
// Tecnologia/Ciència, ARA Cultura, etc.).
const sections = []

// Llista mestra de fonts en SIS llengües (ca, es, en, pt, fr, it). És massa
// gran per baixar-la sencera en un sol refresc sense petar el límit de
// subpeticions del pla gratuït (~50), així que les marcades amb `core: true`
// es baixen SEMPRE (una àncora per llengua perquè cap quedi muda) i la resta
// ROTEN: cada refresc n'agafa una finestra diferent (vegeu selectFeedsForRun).
// Totes les URLs estan validades (responen RSS/Atom amb peces fresques).
const rssFeeds = [
  // ===================== CATALÀ =====================
  { name: 'Vilaweb', url: 'https://www.vilaweb.cat/feed/', language: 'ca', defaultCategory: 'Actualitat', core: true },
  { name: 'ARA', url: 'https://www.ara.cat/rss/', language: 'ca', defaultCategory: 'Actualitat' },
  { name: 'Nació Digital', url: 'https://www.naciodigital.cat/rss/', language: 'ca', defaultCategory: 'Actualitat', core: true },
  { name: 'El Món', url: 'https://elmon.cat/feed/', language: 'ca', defaultCategory: 'Actualitat' },
  // Local de Mataró i el Maresme (Capgròs). Categoria forçada a 'Local'.
  { name: 'Capgròs', url: 'https://capgros.elnacional.cat/uploads/feeds/feed_ca.xml', language: 'ca', defaultCategory: 'Local', forceCategory: true, lenient: true, core: true },
  { name: 'El Punt Avui', url: 'https://www.elpuntavui.cat/?format=feed&type=rss', language: 'ca', defaultCategory: 'Actualitat' },
  { name: 'Betevé', url: 'https://beteve.cat/feed/', language: 'ca', defaultCategory: 'Barcelona' },
  { name: 'Crític', url: 'https://www.elcritic.cat/feed', language: 'ca', defaultCategory: 'Periodisme' },
  { name: 'Diari de Tarragona', url: 'https://www.diaridetarragona.com/rss', language: 'ca', defaultCategory: 'Actualitat' },
  { name: 'ARA Cultura', url: 'https://www.ara.cat/rss/cultura', language: 'ca', defaultCategory: 'Cultura', forceCategory: true },
  { name: 'ARA Internacional', url: 'https://www.ara.cat/rss/internacional', language: 'ca', defaultCategory: 'Internacional', forceCategory: true },

  // ===================== CASTELLÀ =====================
  { name: 'El País', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', language: 'es', defaultCategory: 'Espanya', core: true },
  { name: 'La Vanguardia', url: 'https://www.lavanguardia.com/rss/home.xml', language: 'es', defaultCategory: 'Espanya' },
  { name: 'elDiario', url: 'https://www.eldiario.es/rss/', language: 'es', defaultCategory: 'Espanya' },
  { name: 'RTVE', url: 'https://www.rtve.es/rss/temas_noticias.xml', language: 'es', defaultCategory: 'Espanya' },
  { name: '20minutos', url: 'https://www.20minutos.es/rss/', language: 'es', defaultCategory: 'Espanya' },
  { name: 'ABC', url: 'https://www.abc.es/rss/2.0/portada/', language: 'es', defaultCategory: 'Espanya' },
  { name: 'El Confidencial', url: 'https://rss.elconfidencial.com/espana/', language: 'es', defaultCategory: 'Espanya' },
  { name: 'El Español', url: 'https://www.elespanol.com/rss/', language: 'es', defaultCategory: 'Espanya' },
  { name: 'El Mundo', url: 'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml', language: 'es', defaultCategory: 'Espanya' },
  { name: 'El País Sociedad', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/sociedad/portada', language: 'es', defaultCategory: 'Societat', forceCategory: true },
  // Feeds temàtics per alimentar Cultura/Tecnologia/Ciència.
  { name: 'El País Cultura', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/cultura/portada', language: 'es', defaultCategory: 'Cultura', forceCategory: true },
  { name: 'El País Tecnologia', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada', language: 'es', defaultCategory: 'Tecnologia', forceCategory: true },
  { name: 'El País Ciència', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada', language: 'es', defaultCategory: 'Ciència', forceCategory: true },
  { name: 'La Vanguardia Cultura', url: 'https://www.lavanguardia.com/rss/cultura.xml', language: 'es', defaultCategory: 'Cultura', forceCategory: true },
  { name: 'La Vanguardia Ciència', url: 'https://www.lavanguardia.com/rss/ciencia.xml', language: 'es', defaultCategory: 'Ciència', forceCategory: true },

  // ===================== ANGLÈS =====================
  { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', language: 'en', defaultCategory: 'Món', core: true },
  // Diaris de bones notícies (ja curats: passen sense exigir paraula positiva).
  { name: 'Positive News', url: 'https://www.positive.news/feed/', language: 'en', defaultCategory: 'Món', lenient: true, core: true },
  { name: 'Good News Network', url: 'https://www.goodnewsnetwork.org/feed/', language: 'en', defaultCategory: 'Món', lenient: true },
  { name: 'Reasons to be Cheerful', url: 'https://reasonstobecheerful.world/feed/', language: 'en', defaultCategory: 'Món', lenient: true },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', language: 'en', defaultCategory: 'Món' },
  { name: 'CNN', url: 'http://rss.cnn.com/rss/edition.rss', language: 'en', defaultCategory: 'Món' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'Washington Post', url: 'https://feeds.washingtonpost.com/rss/world', language: 'en', defaultCategory: 'Món' },
  { name: 'New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'Sky News', url: 'https://feeds.skynews.com/feeds/rss/world.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'The Independent', url: 'https://www.independent.co.uk/news/world/rss', language: 'en', defaultCategory: 'Món' },
  { name: 'Wall Street Journal', url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/news.rss', language: 'en', defaultCategory: 'Economia' },
  { name: 'Financial Times', url: 'https://www.ft.com/world?format=rss', language: 'en', defaultCategory: 'Economia' },
  { name: 'The Conversation', url: 'https://theconversation.com/articles.atom', language: 'en', defaultCategory: 'Coneixement' },
  { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', language: 'en', defaultCategory: 'Ciència', forceCategory: true },
  { name: 'Phys.org', url: 'https://phys.org/rss-feed/', language: 'en', defaultCategory: 'Ciència', forceCategory: true },
  { name: 'BBC Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', language: 'en', defaultCategory: 'Ciència', forceCategory: true },
  { name: 'Guardian Science', url: 'https://www.theguardian.com/science/rss', language: 'en', defaultCategory: 'Ciència', forceCategory: true },
  { name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', language: 'en', defaultCategory: 'Tecnologia', forceCategory: true },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', language: 'en', defaultCategory: 'Tecnologia', forceCategory: true },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', language: 'en', defaultCategory: 'Tecnologia', forceCategory: true },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', language: 'en', defaultCategory: 'Tecnologia', forceCategory: true },
  { name: 'Guardian Culture', url: 'https://www.theguardian.com/culture/rss', language: 'en', defaultCategory: 'Cultura', forceCategory: true },
  { name: 'Smithsonian', url: 'https://www.smithsonianmag.com/rss/latest_articles/', language: 'en', defaultCategory: 'Cultura', forceCategory: true },
  { name: 'Euronews', url: 'https://www.euronews.com/rss?level=theme&name=news', language: 'en', defaultCategory: 'Europa' },

  // ===================== PORTUGUÈS =====================
  { name: 'Observador', url: 'https://observador.pt/feed/', language: 'pt', defaultCategory: 'Món', core: true },
  { name: 'RTP Notícias', url: 'https://www.rtp.pt/noticias/rss', language: 'pt', defaultCategory: 'Món' },
  { name: 'CNN Portugal', url: 'https://cnnportugal.iol.pt/rss', language: 'pt', defaultCategory: 'Món' },
  { name: 'Folha de S.Paulo', url: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml', language: 'pt', defaultCategory: 'Món' },
  { name: 'G1', url: 'https://g1.globo.com/rss/g1/', language: 'pt', defaultCategory: 'Món' },
  { name: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', language: 'pt', defaultCategory: 'Món' },

  // ===================== FRANCÈS =====================
  { name: 'Le Monde', url: 'https://www.lemonde.fr/rss/une.xml', language: 'fr', defaultCategory: 'Europa', core: true },
  { name: 'Positivr', url: 'https://positivr.fr/feed/', language: 'fr', defaultCategory: 'Europa', lenient: true },
  { name: 'Le Figaro', url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml', language: 'fr', defaultCategory: 'Europa' },
  { name: 'Libération', url: 'https://www.liberation.fr/arc/outboundfeeds/rss/?outputType=xml', language: 'fr', defaultCategory: 'Europa' },
  { name: 'France 24', url: 'https://www.france24.com/fr/rss', language: 'fr', defaultCategory: 'Europa' },
  { name: 'RFI', url: 'https://www.rfi.fr/fr/rss', language: 'fr', defaultCategory: 'Europa' },
  { name: '20 Minutes', url: 'https://www.20minutes.fr/feeds/rss-une.xml', language: 'fr', defaultCategory: 'Europa' },
  { name: 'Ouest-France', url: 'https://www.ouest-france.fr/rss/une', language: 'fr', defaultCategory: 'Europa' },
  { name: 'Franceinfo', url: 'https://www.francetvinfo.fr/titres.rss', language: 'fr', defaultCategory: 'Europa' },
  { name: 'Le Parisien', url: 'https://feeds.leparisien.fr/leparisien/rss', language: 'fr', defaultCategory: 'Europa' },
  { name: 'Courrier International', url: 'https://www.courrierinternational.com/feed/all/rss.xml', language: 'fr', defaultCategory: 'Món' },
  { name: 'Sciences et Avenir', url: 'https://www.sciencesetavenir.fr/rss.xml', language: 'fr', defaultCategory: 'Ciència', forceCategory: true },

  // ===================== ITALIÀ =====================
  { name: 'la Repubblica', url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml', language: 'it', defaultCategory: 'Europa', core: true },
  { name: 'ANSA', url: 'https://www.ansa.it/sito/ansait_rss.xml', language: 'it', defaultCategory: 'Europa' },
  { name: 'La Stampa', url: 'https://www.lastampa.it/rss', language: 'it', defaultCategory: 'Europa' },
  { name: 'Rai News', url: 'https://www.rainews.it/rss/tutti', language: 'it', defaultCategory: 'Europa' },
  { name: 'Il Fatto Quotidiano', url: 'https://www.ilfattoquotidiano.it/feed/', language: 'it', defaultCategory: 'Europa' },
  { name: 'Open', url: 'https://www.open.online/feed/', language: 'it', defaultCategory: 'Europa' },
  { name: 'Internazionale', url: 'https://www.internazionale.it/sitemaps/rss.xml', language: 'it', defaultCategory: 'Món' },
  { name: 'Il Sole 24 Ore', url: 'https://www.ilsole24ore.com/rss/italia.xml', language: 'it', defaultCategory: 'Economia' },
  { name: 'ANSA Cultura', url: 'https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml', language: 'it', defaultCategory: 'Cultura', forceCategory: true },
]

// Quantes fonts es baixen com a màxim per refresc (límit de subpeticions del
// pla gratuït ~50; en deixem ~14 per a la IA). Les `core` sempre; la resta
// roten en finestres deterministes que avancen cada interval de refresc, de
// manera que en poques hores es cobreixen totes les fonts del món.
// Quantes fonts ROTATÒRIES de cada llengua entren a CADA refresc. El català i
// el castellà (llengües de casa) en porten més; la resta, menys però sempre
// alguna. Roten dins de cada llengua (avancen amb el temps), de manera que cada
// refresc duu sempre una barreja de les sis llengües i, en uns quants refrescs,
// es cobreix tota la llista mestra. core (9) + 13 rotatòries = 22 fonts/refresc,
// que deixa marge per a les ~6 crides de la IA sota el límit de subpeticions.
// El català en porta més (és la llengua de casa i ha de dominar la portada) i
// l'anglès menys (ja té dues fonts core: BBC i Positive News).
const rotatingPerLanguage = { ca: 5, es: 3, en: 2, fr: 1, it: 1, pt: 1 }

function selectFeedsForRun(nowMs) {
  const core = rssFeeds.filter((feed) => feed.core)
  const tick = Math.floor(nowMs / refreshIntervalMs)
  const seen = new Set(core.map((feed) => feed.url))
  const picked = []
  for (const [language, count] of Object.entries(rotatingPerLanguage)) {
    const pool = rssFeeds.filter(
      (feed) => !feed.core && feed.language === language,
    )
    if (!pool.length) continue
    for (let i = 0; i < count; i += 1) {
      const feed = pool[(tick * count + i) % pool.length]
      if (!seen.has(feed.url)) {
        seen.add(feed.url)
        picked.push(feed)
      }
    }
  }
  return [...core, ...picked]
}

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
      'transformació', 'amplia', 'amplien', 'reviu', 'reviuen',
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
      'bloqueig', 'droga', 'drogues', 'narcotràfic', 'tedh', 'desaparegut',
      'jutjat', 'jutge', 'al jutjat', 'descompte',
      'cannabis', 'porros',
      'condemna', 'condemnat', 'fuetades', 'divendres negre', 'despropòsit',
      'apuja el to', 'dèficit comercial', 'irregularitat', 'cas contra',
      'cas de begoña', 'tribunal penal',
      'ultradreta', 'feixis', 'antifeixis', 'desafia', 'veto', 'vetar', 'moció de',
      'caça de combat', 'avió de combat', 'armament', 'bèl·lic', 'fcas',
      'míssil', 'caça militar',
      'cop d\'estat', 'cop militar', 'exèrcit ha d', 'intervenció militar',
      'posconvergent', 'no descarta', 'aliança catalana',
      // Dimissions, destitucions i governs que cauen: no és mai bona notícia
      // (colat el 22/06 amb la dimissió del primer ministre britànic).
      'dimissi', 'dimiteix', 'dimitir', 'destitu', 'cessament', 'cau el govern',
      'govern cau', 'crisi de govern',
      // Fracàs acadèmic i dades en declivi: no és bona notícia (colat el 24/06
      // amb "els estudiants suspenen... la mitjana més baixa de la dècada").
      'suspèn', 'suspenen', 'suspès', 'suspesos', 'suspeses', 'fracàs escolar',
      'abandonament escolar', 'mitjana més baixa', 'nota més baixa',
      'més baixa de la dècada', 'més baix de la dècada', 'pitjor mitjana',
      'pitjor nota', 'pitjor resultat', 'pitjors resultats', 'pitjor dada',
      'pitjor de la dècada', 'pitjor de la història',
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
      // Immigració per via marítima i naufragis (colat el 28/06: "Arriben dues
      // pasteres amb 25 persones a Formentera" — "arriben" és paraula positiva).
      'pastera', 'pasteres', 'naufragi', 'ofegat', 'ofegats', 'ofegada',
      'immigració irregular', 'sense papers', 'salt a la tanca',
      // Pujada de preus, turistificació i massificació (colat el 28/06: "Hotels
      // plens i preus més alts abans del Tour" — "arribada" comptava com a positiu).
      'preus més alts', 'preus disparats', 'preus pels núvols', 'encariment',
      'encareix', 'apuja els preus', 'apugen els preus', 'turistificació',
      'sobreturisme',
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
      'transformación', 'amplía', 'amplían', 'revive',
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
      'fallece', 'fallecen', 'fallecid', 'droga', 'drogas', 'bloqueo', 'desaparecid',
      'juzgado', 'descuentos de', 'tira la casa por la ventana',
      'cannabis', 'porros',
      'condena', 'condenado', 'latigazos', 'irregularidad', 'déficit comercial',
      'caso contra', 'caso de begoña', 'sube el tono', 'desbanca',
      'ultraderecha', 'fascis', 'antifascis', 'desafía', 'desafia la', 'veto', 'moción de',
      'caza de combate', 'caza de sexta', 'avión de combate', 'aviones de combate',
      'f-35', 'f-47', 'fcas', 'misil', 'armamento', 'bélic',
      'golpe de estado', 'golpe militar', 'ejército debe', 'intervención militar', 'asonada',
      'posconvergent', 'no descarta', 'alianza catalana',
      // Dimisiones, destituciones y gobiernos que caen: no es buena noticia
      // (colado el 22/06 con la dimisión del primer ministro británico).
      'dimite', 'dimiten', 'dimitir', 'dimisión', 'dimisi', 'destitu', 'cese del',
      'cae el gobierno', 'crisis de gobierno',
      // Fracaso académico y datos en declive (paral·lel al català).
      'suspende', 'suspenden', 'suspenso', 'suspensos', 'fracaso escolar',
      'abandono escolar', 'media más baja', 'nota más baja',
      'más baja de la década', 'más baja de la historia', 'peor media',
      'peor nota', 'peor resultado', 'peores resultados', 'peor dato',
      'peor de la década', 'peor de la historia',
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
      // Inmigración por vía marítima y naufragios (paral·lel al català: "llegan
      // pateras", "rescate de un cayuco"…). Siempre es contenido de crisis.
      'patera', 'pateras', 'cayuco', 'cayucos', 'naufragio', 'ahogad',
      'inmigración irregular', 'migración irregular', 'sin papeles',
      'salto a la valla',
      // Subida de precios, turistificación y masificación (paral·lel al català).
      'precios más altos', 'se disparan los precios', 'suben los precios',
      'encarecimiento', 'encarece', 'sobreturismo', 'turistificación',
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
      'transforms', 'expands', 'revives', 'positive',
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
      'guns', 'drug user', 'medical records', 'tried to sell', 'dies after', 'fallece',
      'cannabis', 'marijuana',
      'urged to drop', 'activists target', 'aramco', 'trade deficit', 'lashes',
      'fighter jet', 'combat aircraft', 'warplane', 'weapon', 'arms deal', 'f-35',
      'troops', 'crashes', 'crashed', 'tragedy', 'tragic', 'famine',
      'starvation', 'epidemic', 'pandemic', 'outbreak',
      // Resignations, ousters and collapsing governments: not good news
      // (slipped in on 22/06 with the UK prime minister's resignation).
      'resign', 'resigns', 'resigned', 'resignation', 'steps down',
      'stepped down', 'ousted', 'ouster', 'no-confidence', 'quits as',
      'topples government', 'government collapse',
      'lowest average', 'worst results', 'worst in a decade', 'school dropout',
      'dropout rate', 'failing grades', 'record low pass',
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
      'positif', 'positive', 'historique', 'approuve', 'apporte',
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
      'cannabis', 'drogue', 'armée', 'militaire', 'coup d\'état', 'intervention militaire',
      // Démissions, destitutions et gouvernements qui tombent : pas une bonne nouvelle.
      'démission', 'démissionne', 'démissionner', 'destitu', 'limogé',
      'chute du gouvernement', 'motion de censure',
      'moyenne la plus basse', 'pires résultats', 'échec scolaire', 'décrochage scolaire',
      // Onada de calor i angoixa (colat el 24/06: "la canicule fauche les écoles").
      'canicule', 'désemparé', 'désemparés', 'fortes chaleurs', 'fauche',
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
  pt: {
    positive: [
      'sucesso', 'ajuda', 'ajudam', 'solidariedade', 'recupera', 'salva',
      'salvou', 'salvar', 'prémio', 'prêmio', 'galardão', 'recorde', 'ganha',
      'vence', 'venceu', 'campeão', 'inaugura', 'estreia', 'estréia', 'regressa',
      'descobre', 'descoberta', 'inovação', 'inovador', 'projeto', 'projecto',
      'nasce', 'melhora', 'melhoria', 'avança', 'esperança', 'protege',
      'restaura', 'abre', 'celebra', 'homenagem', 'reconhecimento', 'histórico',
      'acordo', 'pacto', 'investigação', 'pesquisa', 'voluntário', 'voluntária',
      'doação', 'iniciativa', 'conquista', 'vacina', 'recuperação', 'impulsiona',
      'reforça', 'beneficia', 'apoia', 'crescimento', 'inclusão', 'inclusivo',
      'gratuito', 'gratuita', 'renova', 'sustentável', 'cooperação',
    ],
    negative: [
      'guerra', 'míssil', 'bomba', 'ataque', 'atentado', 'violência',
      'violencia', 'conflito', 'invasão', 'derrota', 'crise', 'morte', 'morto',
      'morta', 'mortos', 'morre', 'morreu', 'vítima', 'vítimas', 'refém',
      'reféns', 'assalto', 'assassinato', 'assassino', 'homicídio', 'tiroteio',
      'massacre', 'genocídio', 'crime', 'criminoso', 'roubo', 'furto', 'ladrão',
      'fraude', 'corrupção', 'corrupto', 'detido', 'detida', 'preso', 'prisão',
      'cadeia', 'denúncia', 'queixa', 'condenado', 'condenação', 'escândalo',
      'tragédia', 'trágico', 'catástrofe', 'incêndio', 'terramoto', 'terremoto',
      'seca', 'enchente', 'inundação', 'emergência', 'droga', 'drogas',
      'cannabis', 'narcotráfico', 'extrema-direita', 'extrema direita',
      'fascista', 'xenofobia', 'terrorismo', 'terrorista', 'demite', 'demitir',
      'demissão', 'demitiu', 'destitui', 'destituição', 'queda do governo',
      'média mais baixa', 'piores resultados', 'fracasso escolar', 'abandono escolar',
      'moção de censura', 'greve', 'despedimento', 'cancro', 'doença', 'surto',
      'pandemia', 'epidemia', 'abuso', 'agressão', 'sequestro', 'rapto',
      'polémica', 'polêmica', 'guerrilha', 'golpe de estado',
    ],
  },
  it: {
    positive: [
      'successo', 'aiuta', 'aiuto', 'solidarietà', 'recupera', 'salva',
      'salvato', 'premio', 'riconoscimento', 'record', 'vittoria', 'ha vinto',
      'campione', 'inaugura', 'debutta', 'scopre', 'scoperta', 'innovazione',
      'innovativo', 'progetto', 'nasce', 'migliora', 'miglioramento', 'avanza',
      'speranza', 'protegge', 'restaura', 'apre', 'celebra', 'omaggio',
      'storico', 'accordo', 'patto', 'ricerca', 'volontario', 'volontaria',
      'donazione', 'iniziativa', 'traguardo', 'vaccino', 'rinasce', 'sostiene',
      'rafforza', 'beneficia', 'conquista', 'crescita', 'inclusione',
      'inclusivo', 'gratuito', 'gratuita', 'rinnova', 'sostenibile',
      'cooperazione', 'guarisce', 'guarito',
    ],
    negative: [
      'guerra', 'missile', 'bomba', 'attacco', 'attentato', 'violenza',
      'conflitto', 'invasione', 'sconfitta', 'crisi', 'morte', 'morto', 'morta',
      'morti', 'muore', 'ucciso', 'uccide', 'omicidio', 'assassinio',
      'assassino', 'vittima', 'vittime', 'ostaggio', 'sparatoria', 'strage',
      'genocidio', 'crimine', 'criminale', 'rapina', 'furto', 'ladro', 'frode',
      'corruzione', 'corrotto', 'arrestato', 'arresto', 'carcere', 'prigione',
      'denuncia', 'condannato', 'condanna', 'scandalo', 'tragedia', 'tragico',
      'catastrofe', 'incendio', 'terremoto', 'siccità', 'alluvione', 'emergenza',
      'droga', 'droghe', 'cannabis', 'narcotraffico', 'estrema destra',
      'fascista', 'xenofobia', 'terrorismo', 'terrorista', 'dimette',
      'dimissioni', 'dimissione', 'destituz', 'sfiducia', 'licenziamento',
      'licenzia', 'sciopero', 'cancro', 'malattia', 'epidemia', 'pandemia',
      'abuso', 'aggressione', 'sequestro', 'rapimento', 'crollo', 'degrado',
      'golpe', 'colpo di stato',
      'media più bassa', 'peggiori risultati', 'abbandono scolastico', 'bocciati',
    ],
  },
}

function getDictionary(language) {
  return editorialDictionaries[language] || editorialDictionaries.ca
}

export function passesEditorialFilter(text, language) {
  // Algunes paraules xoquen amb arrels del diccionari quan es compara per
  // trossos: "Mataró" conté "matar" (negatiu); "estudiant" conté "estudi"
  // (positiu), de manera que QUALSEVOL notícia d'estudiants es llegia com a bona
  // (p. ex. "els estudiants suspenen..."). Les neutralitzem amb un token abans
  // de buscar paraules bones i dolentes.
  const normalized = text
    .toLowerCase()
    .replace(/matar[oó]/g, 'la-ciutat')
    .replace(/estudiant/g, 'alumne')
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

// Acota quantes peces pot aportar cada llengua forana (les de casa, ca/es, no
// tenen sostre). Manté l'ordre d'entrada; descarta l'excedent de cada llengua
// limitada. Evita que un dia els feeds europeus d'alt volum omplin tota la
// portada i deixin el català i el castellà fora.
export function capPerLanguage(stories, caps) {
  const counts = new Map()
  const kept = []
  for (const story of stories) {
    const language = story.language || '?'
    const cap = caps[language]
    if (cap == null) {
      kept.push(story)
      continue
    }
    const count = counts.get(language) || 0
    if (count < cap) {
      kept.push(story)
      counts.set(language, count + 1)
    }
  }
  return kept
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

// Coincidència per PARAULA SENCERA. Sense això, topònims curts es colaven dins
// de paraules d'altres llengües: "reus" dins de "nombreuses" (fr) feia que una
// notícia francesa es localitzés a "Reus, Catalunya". \p{L} tracta les lletres
// accentuades com a part de la paraula.
function hasWord(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, 'iu').test(text)
}

function detectLocation(text) {
  if (hasWord(text, 'mataró') || hasWord(text, 'maresme')) return 'Mataró, Maresme'
  if (hasWord(text, 'barcelona') || hasWord(text, 'bcn')) return 'Barcelona, Catalunya'
  if (hasWord(text, 'girona')) return 'Girona, Catalunya'
  if (hasWord(text, 'lleida')) return 'Lleida, Catalunya'
  if (hasWord(text, 'tarragona')) return 'Tarragona, Catalunya'
  if (hasWord(text, 'reus')) return 'Reus, Catalunya'
  if (hasWord(text, 'catalunya') || hasWord(text, 'català')) return 'Catalunya'
  if (hasWord(text, 'madrid')) return 'Madrid'
  if (hasWord(text, 'sevilla')) return 'Sevilla'
  if (hasWord(text, 'españa') || hasWord(text, 'spain')) return 'Espanya'
  if (hasWord(text, 'london') || hasWord(text, 'londres')) return 'Londres'
  if (hasWord(text, 'paris') || hasWord(text, 'parís')) return 'París'
  if (hasWord(text, 'berlin') || hasWord(text, 'berlín')) return 'Berlín'
  if (hasWord(text, 'washington')) return 'Washington'
  if (hasWord(text, 'new york') || hasWord(text, 'nova york')) return 'Nova York'
  if (hasWord(text, 'france') || hasWord(text, 'frança')) return 'França'
  if (hasWord(text, 'italia') || hasWord(text, 'italy') || hasWord(text, 'roma')) return 'Itàlia'
  if (hasWord(text, 'portugal') || hasWord(text, 'lisboa') || hasWord(text, 'lisbon')) return 'Portugal'
  if (hasWord(text, 'brasil') || hasWord(text, 'brazil')) return 'Brasil'
  if (hasWord(text, 'europe') || hasWord(text, 'europa')) return 'Europa'
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

// Marcadors de contingut POLÍTIC tens (partits, procés electoral o parlamentari,
// judicial). No bloquegen la notícia —de tant en tant hi ha política bona— però
// li treuen el passi lliure: haurà de passar per la IA per sortir, en lloc de
// colar-se per una paraula positiva incidental. S'eviten mots ambigus com "junts"
// (=plegats) o "sumar" (=afegir); s'usen formes inequívoques.
const POLITICAL_MARKERS = new RegExp(
  [
    'psoe', '\\bvox\\b', '\\berc\\b', 'podemos', 'bildu', '\\bpnv\\b', 'ciudadanos',
    'alian[çc]a catalana', 'partit popular', 'partido popular', 'prim[àa]ries',
    'primarias', 'investidura', 'moci[óo] de censura', 'esmena', 'enmienda',
    'escaño', 'bancada', 'electoral', 'eleccion', 'elecci[óo]ns', 'urnes',
    'portaveu del', 'portavoz del', 'posconvergent', 'retret',
    'reproche', 'dimissi', 'dimisi[óo]n', 'destituci', 'cessament',
    '\\bpcp\\b', 'm[áa]s madrid', 'fratelli d', 'rassemblement national',
    // Eleccions i recompte de vots en QUALSEVOL llengua: un resultat electoral
    // no és classificable com a bona/mala notícia (política contestada). Es
    // tracta com a política → neutre → només surt si la IA ho aprova.
    'elezioni', 'elei[çc][õo]es', 'eleitoral', '\\belections?', 'scrutin',
    'scrutín', 'ballottaggio', 'ballot', 'runoff', 'voters', 'comicios',
    'voti esteri', 'al voto', 'recompte de vots', 'recuento de votos',
    // 'lectoral' captura electoral I électoral (fr); presidencial/-iel/-ziale
    // cobreixen "élection présidentielle", "elezioni presidenziali", etc.
    'lectoral', 'présidentiel', 'presidenzial', 'presidencial', 'législativ',
  ].join('|'),
  'i',
)

// Bloc dur UNIVERSAL (multilingüe): categories de mala notícia que el filtre de
// paraules per idioma i el model petit deixaven passar. Es bloquegen en sec.
const UNIVERSAL_NEG = new RegExp(
  [
    // Calor extrema / desastre climàtic (ca/es/it/fr/pt/en).
    'onada de calor', 'ola de calor', 'onda de calor', 'ondata di calore',
    'vague de chaleur', 'heatwave', 'heat wave', 'calor extrem', 'calor extremo',
    'calor h[úu]m[ei]do', 'caldo record', 'caldo torrido', 'morsa del caldo',
    'd[íi][ae]s de calor', 'calor perill', 'calor peligros',
    'hottest day', 'jour le plus chaud', 'dia mais quente', 'devido ao calor',
    'cop de calor', 'golpe de calor', 'colpo di calore', 'dies de calor',
    // Addicció a les pantalles / mòbil.
    'enganchados al m[óo]vil', 'enganxats al m[òo]bil', 'adicci[óo]n al m[óo]vil',
    'addicci[óo] al m[òo]bil', 'phone addiction', 'dipendenza da smartphone',
    'adicci[óo]n a las pantallas',
    // Conflicte, guerra i geopolítica tensa (el model petit ho aprova massa):
    'netanyahu', 'cisjord[àa]nia', 'cisjordania', 'west bank',
    'israel', '\\bgaza\\b', '\\bhamas\\b', 'hezbol', 'taliban', 'l[íi]bano',
    'l[íi]ban\\b', 'ucra[ïi]na', 'ucrania', 'ukraine', '\\bputin\\b', 'kremlin',
    '\\bir[áa]n', 'ir[ãa]o', 'ormuz', 'houthi', 'hut[íi]', '\\bsiria\\b',
    '\\bsyrie\\b', 'guerra', 'm[íi]ssil', 'misil', 'missile', 'bombarde',
    'retirada de tropes', 'retirada de tropas', 'alto el fuego', 'cessez-le-feu',
    // Justícia, jutjats i causes (no és bona notícia):
    '\\bjuez\\b', '\\bjutge\\b', 'al jutge', 'al juez', 'pasaporte al',
    'imputad', 'imputaci', 'fiscal[íi]a', 'tribunal', 'comparece ante',
    // Esport en directe / retransmissió (farciment, no és notícia constructiva):
    'en direct\\b', 'en directe', 'en directo', 'minuto a minuto', 'minut a minut',
    // Alertes sanitàries i alimentàries / retirades de producte:
    'alerta aliment', 'alerta sanit', 'salmonel', 'listeria', 'recall',
    'rappel produit', 'retiran del mercado', 'retiren del mercat',
    // Caiguda i crisi econòmica:
    'recess', 'desplome', 'desplom\\b', 'pierde su condici', 'cae en bolsa',
    'cau en borsa', 'crac bors', 'crash burs', 'crescer menos',
    // Dòping:
    'doping', 'dopatge', 'dopaje', 'dopage', 'antidop',
    // Armes i decomisos:
    'armes blanques', 'armas blancas', 'arma blanca', 'comissad', 'decomisad',
    'incautad',
    // Codi penal / pèrdua de nacionalitat:
    'c[óo]digo penal', 'codi penal', 'perda de nacionalidade',
    'p[ée]rdida de nacionalidad',
    // Morts (inclou plurals que se saltaven 'muerte'/'mort') i ofegaments:
    '\\bmuertos?\\b', '\\bmorts\\b', '\\bmorti\\b', '\\bmortes\\b', 'falleci',
    'd[ée]c[èe]s', 'ahogad', 'ahogamiento', 'afogad', 'afogamento', 'noyade',
    'annega', 'drowning', 'drowned',
    // Brots i malalties:
    '\\bgripe\\b', 'epidemia', 'epidemic', 'brote de', 'brot de', 'surto de',
    // Estadístiques negatives de salut (obesitat/sobrepès) i segrestos:
    'sobrepes', 'excesso de peso', 'exceso de peso', 'obesi', 'overweight',
    'ob[ée]sit', 'secuestr', 'sequestr', 'segrest', 'rapiment', 'held captive',
    'kidnap',
    // Immigració per via marítima i naufragis: el radar ho tractava com a BONA
    // notícia perquè "arriben/arribar" és paraula positiva (colat el 28/06 amb
    // "Arriben dues pasteres a Formentera"). És sempre contingut de crisi.
    'pastera', 'pasteres', 'patera', 'cayuco', 'cayucos', 'naufrag',
    'migrant boat', 'small boat', 'channel crossing',
    'migraci[óo]n irregular', 'immigraci[óo] irregular', 'imigra[çc][ãa]o ilegal',
    'sin papeles', 'sense papers', 'salto a la valla', 'salt a la tanca',
  ].join('|'),
  'i',
)

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
  const fullTextLower = fullText.toLowerCase()
  const { isPositive, isNegative } = passesEditorialFilter(fullText, feed.language)
  if (isNegative) return null // clarament negativa (guerra, conflicte…): fora directament
  // Bloc dur universal (multilingüe) per a categories que el model petit deixa
  // passar: calor extrem/desastre climàtic i addicció a les pantalles.
  if (!feed.lenient && UNIVERSAL_NEG.test(fullTextLower)) return null

  // Contingut POLÍTIC (maniobres de partit, eleccions, judicis, ultradreta…):
  // gairebé mai és bona notícia i el model petit l'aprova per error massa sovint.
  // El BLOQUEGEM en sec, com les negatives. Els feeds locals queden exempts (el
  // plenari de Mataró sí que hi té cabuda).
  const isPolitical =
    !feed.lenient &&
    (category === 'Política' || POLITICAL_MARKERS.test(fullTextLower))
  if (isPolitical) return null
  const editorialScore = isPositive || feed.lenient ? 1 : 0

  const story = {
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
    // editorialScore calculat a dalt: 0 = neutre/polític (només surt si la IA
    // l'aprova) · 1 = bo (paraula clau positiva o feed local).
    editorialScore,
    // Font ja curada de bones notícies (Positive News, Good News Network…): la
    // IA hi confia i no la veta (com el contingut Local).
    curated: Boolean(feed.lenient),
    editorialVersion: liveEditorialVersion,
    publishedAt,
  }
  // No la llencem (les clarament negatives ja han caigut amunt). La IA revisarà
  // totes les candidates: vetarà les dolentes que han colat per paraula clau i
  // rescatarà les bones neutres (p. ex. un producte nou amb aplicacions positives).
  // editorialScore: 1 = ha passat per paraula clau · 0 = neutra.
  return story
}

async function collectFeedStories(feed) {
  try {
    const response = await fetch(feed.url, {
      headers: {
        accept: 'application/rss+xml, application/xml, application/atom+xml, text/xml, */*',
        'user-agent': 'El Bon Diari/1.0 (+https://bondiari.com)',
      },
    })
    if (!response.ok) {
      console.warn(`[radar] Feed ${feed.name} ha respost ${response.status}`)
      return { stories: [], candidates: 0 }
    }
    const xml = await response.text()
    if (!/<rss[\s>]|<feed[\s>]/i.test(xml)) {
      console.warn(`[radar] Feed ${feed.name} no sembla RSS/Atom (${xml.length} bytes)`)
      return { stories: [], candidates: 0 }
    }

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

// --- Segona capa: rescat amb IA (Cloudflare Workers AI) --------------------
// El filtre de paraules clau és ràpid però cec al sentit: rebutja notícies
// NEUTRES (sense paraula positiva ni negativa) com l'anunci d'un producte nou,
// encara que tingui aplicacions positives. Aquí una IA jutja aquests casos
// ambigus i en rescata els que SÍ són bones notícies. El veredicte es desa a
// KV per URL perquè no s'hagi de tornar a jutjar a cada refresc.

// Llama 3.3 70B (≈23× més gran que el 3B anterior): jutja "bona/mala notícia"
// molt millor i amb els matisos. Gratis dins de la quota diària de Neurons de
// Cloudflare; el consum és baix perquè només es jutgen les notícies noves.
const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const aiVerdictsKey = 'ai-verdicts-v2' // un sol registre KV amb TOTS els veredictes
const aiVerdictTtlMs = 14 * 24 * 60 * 60 * 1000 // 14 dies
// La IA jutja en LOTS: moltes notícies en una sola crida. Així, amb poques
// subpeticions (límit del pla gratuït), arriba a revisar-ne ~aiBatchSize ×
// maxAiCallsPerRun per passada i passa a ser el PORTER de debò, en lloc de
// revisar-ne només 10 i deixar passar la resta per paraula clau.
const aiBatchSize = 10
const maxAiCallsPerRun = 6 // 6×10 = 60 jutjades/passada; 24 feeds + 6 = 30 subpeticions

const AI_SYSTEM_BATCH = [
  "Ets el filtre d'El Bon Diari, un diari que NOMÉS publica BONES notícies.",
  'Et passo una llista numerada de titulars. Per a CADA número respon en una',
  'línia amb el format "N: SI" o "N: NO" (només això, res més).',
  'Respon NO si el titular és dolent, trist o tens: guerra, mort, accident,',
  'succés, crim, armes, droga, judici, corrupció, escàndol, política o',
  'eleccions, conflicte, retret o insult, tensió diplomàtica o comercial,',
  'sanció, alerta sanitària o alimentària, condemna o càstig, dòping, onada de',
  'calor o desastre climàtic, crisi o caiguda econòmica, acomiadaments,',
  'immigració irregular, pasteres, naufragis o rescats al mar, o',
  'resultats i fitxatges de competició esportiva.',
  'Respon SI NOMÉS si és clarament constructiva, amable, cultural, científica,',
  'solidària, educativa o un avenç positiu. En cas de DUBTE, respon NO.',
  'Exemple:\n1: NO\n2: SI\n3: NO',
].join(' ')

// Jutja un lot de notícies en una sola crida. Retorna un array de true/false/
// null (null = el model no ha donat veredicte clar per a aquell número).
async function aiJudgeBatch(env, stories) {
  const list = stories
    .map((s, i) => `${i + 1}. ${(s.title || '').replace(/\s+/g, ' ').slice(0, 150)}`)
    .join('\n')
  const out = await env.AI.run(AI_MODEL, {
    max_tokens: 256,
    messages: [
      { role: 'system', content: AI_SYSTEM_BATCH },
      { role: 'user', content: `Titulars:\n${list}` },
    ],
  })
  const text = String(out?.response || '')
  const verdicts = new Array(stories.length).fill(null)
  for (const m of text.matchAll(/(\d{1,2})\s*[:.)\-]?\s*(S[IÍ]|NO|YES)\b/gi)) {
    const idx = parseInt(m[1], 10) - 1
    if (idx >= 0 && idx < stories.length && verdicts[idx] === null) {
      verdicts[idx] = /^[SY]/i.test(m[2])
    }
  }
  return verdicts
}

// La IA revisa les candidates EN LOTS (moltes per crida) i VETA les dolentes
// que han colat pel filtre de paraules. Defensa en profunditat: els blocs durs
// (negatius per idioma + UNIVERSAL_NEG + política) treuen les categories
// clarament dolentes de manera fiable; la IA, a sobre, neteja les subtils. Una
// notícia no jutjada (per pressupost o IA caiguda) es manté si ha passat per
// paraula clau, de manera que una fallada de la IA mai no buida ni embruta el
// diari. Els veredictes es guarden en UN sol registre KV (14 dies).
async function aiReview(env, candidates) {
  if (!env?.AI) {
    return candidates.filter((story) => (story.editorialScore ?? 1) > 0)
  }
  const kv = env.LIVE_NEWS_KV
  let store
  try {
    store = (await kv.get(aiVerdictsKey, 'json')) || {}
  } catch {
    store = {}
  }
  const now = Date.now()
  const verdict = new Map() // url -> bool
  const toJudge = []
  let dirty = false

  for (const story of candidates) {
    // Contingut Local (Mataró/Maresme) i fonts JA curades de bones notícies:
    // s'hi confia, no passen per la IA (el model petit els vetaria per error).
    if (story.category === 'Local' || story.curated) {
      verdict.set(story.url, true)
      continue
    }
    const cached = store[story.url]
    if (cached && now - cached.at < aiVerdictTtlMs) {
      verdict.set(story.url, cached.v)
    } else {
      toJudge.push(story)
    }
  }

  let judged = 0
  let consecutiveFails = 0
  for (
    let i = 0;
    i < toJudge.length && judged < maxAiCallsPerRun * aiBatchSize;
    i += aiBatchSize
  ) {
    const batch = toJudge.slice(i, i + aiBatchSize)
    let res = null
    try {
      res = await aiJudgeBatch(env, batch)
      consecutiveFails = 0
    } catch (error) {
      console.warn('[ai] error jutjant lot', error?.message || error)
      consecutiveFails += 1
    }
    batch.forEach((story, j) => {
      const v = res ? res[j] : null
      if (v === null || v === undefined) {
        // No jutjada (o la crida ha fallat): paraula clau. Els blocs durs ja
        // n'han tret les clarament dolentes, així que és prou segur.
        verdict.set(story.url, (story.editorialScore ?? 1) > 0)
      } else {
        verdict.set(story.url, v)
        store[story.url] = { v, at: now }
        dirty = true
      }
    })
    judged += batch.length
    if (consecutiveFails >= 2) break // IA caiguda: deixem de gastar-hi crides
  }

  // Les que han quedat sense jutjar (passat el pressupost): paraula clau. Els
  // blocs durs (UNIVERSAL_NEG, política, negatius per idioma) ja han tret les
  // categories dolentes; la IA neteja les subtils que SÍ que ha pogut jutjar.
  for (const story of toJudge) {
    if (verdict.has(story.url)) continue
    verdict.set(story.url, (story.editorialScore ?? 1) > 0)
  }

  if (dirty) {
    for (const url of Object.keys(store)) {
      if (now - store[url].at > aiVerdictTtlMs) delete store[url]
    }
    try {
      await kv.put(aiVerdictsKey, JSON.stringify(store))
    } catch (error) {
      console.warn('[ai] no s\'ha pogut desar el cau', error?.message)
    }
  }
  const kept = candidates.filter((story) => verdict.get(story.url))
  console.log(`[ai] candidats=${candidates.length} jutjats=${judged} acceptats=${kept.length}`)
  return kept
}

// --- Recol·lecció combinada -----------------------------------------------

export async function collectLivePositiveNews(env) {
  // Només la finestra de fonts d'aquest refresc (core + rotatòries), per no
  // petar el límit de subpeticions. La rotació avança sola amb el temps.
  const feedsThisRun = selectFeedsForRun(Date.now())
  const [sectionResults, feedResults] = await Promise.all([
    Promise.all(sections.map(collectSectionStories)),
    Promise.all(feedsThisRun.map(collectFeedStories)),
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

  // Candidates dins de termini, ORDENADES per prometedores+fresques (les de
  // paraula clau primer), perquè la IA gasti el pressupost de crides en les més
  // probables de sortir.
  const recents = [...uniqueStories.values()]
    .filter(
      (story) =>
        Date.now() - new Date(story.publishedAt).getTime() <= maxLiveStoryAgeMs,
    )
    .sort((left, right) => {
      // Un DIARI lidera amb el dia d'avui. Ordenem per DIA (el més nou primer)
      // i, dins del mateix dia, per com de prometedora és (paraula clau primer),
      // perquè la IA gasti el pressupost de crides en les millors d'avui. Abans
      // s'ordenava per puntuació sense mirar el dia, i una notícia vella amb
      // moltes paraules positives passava davant de la d'avui.
      const timeLeft = new Date(left.publishedAt).getTime()
      const timeRight = new Date(right.publishedAt).getTime()
      const dayBucket =
        Math.floor(timeRight / 86400000) - Math.floor(timeLeft / 86400000)
      if (dayBucket !== 0) return dayBucket
      return right.editorialScore - left.editorialScore || timeRight - timeLeft
    })

  // La IA revisa les candidates: veta les dolentes que han colat per paraula clau
  // i rescata les bones neutres. Una positiva encara no jutjada es mostra provi-
  // sionalment (el filtre de paraules ja atrapa les dolentes òbvies; la IA va
  // revisant les subtils a cada refresc); una neutra no jutjada s'amaga.
  const reviewed = await aiReview(env, recents)

  // Abans de tallar el pool a collectionPoolSize, posem al davant la millor peça
  // de cada secció garantida (Local, Cultura, Ciència…). Si no, una notícia bona
  // però una mica més vella (p. ex. local del Maresme d'ahir) podria quedar fora
  // del tall i no aparèixer mai, encara que tingués lloc reservat.
  const headUrls = new Set()
  const head = []
  for (const cat of guaranteedCategories) {
    const best = reviewed.find((s) => s.category === cat && !headUrls.has(s.url))
    if (best) {
      head.push(best)
      headUrls.add(best.url)
    }
  }
  const ordered = [...head, ...reviewed.filter((s) => !headUrls.has(s.url))]

  const filtered = ordered
    .map((story) => {
      const { editorialScore: _score, ...rest } = story
      return rest
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

const seenUrlsKey = 'seen-urls-v3'
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
  'Local', 'Cultura', 'Tecnologia', 'Ciència', 'Salut', 'Medi ambient', 'Educació',
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

export async function getLiveNewsPayload(kv, { force = false, env } = {}) {
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

  const { stories: allStories, reviewed: reviewedThisPass } = await collectLivePositiveNews(env)
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

  // (El marcatge de "vistes" es fa MÉS AVALL, només per a les que de debò entren
  // al lot. Marcar-les totes aquí cremava notícies acceptades que quedaven fora
  // del tall —p. ex. catalanes desplaçades per l'allau de bones notícies en
  // anglès— i no podien tornar mai. Vegeu el bloc després de finalStories.)

  // Construïm el lot final. Amb 80 fonts en sis llengües cap refresc sol no pot
  // representar-les totes (cada passada captura un grapat de fresques, sovint
  // d'una sola llengua). Per això SEMPRE ACUMULEM: notícies fresques d'aquest
  // refresc + arrossegament del lot anterior (revalidat i caducat als 4 dies).
  // Així, refresc rere refresc, el lot va sumant català, castellà, anglès… fins
  // a un mosaic divers i equilibrat, en lloc de substituir-se per la captura
  // d'avui. Les fresques van al davant (lideren les d'avui); el sostre per
  // llengua i la diversitat per font fan la resta.
  const carryover = (cached?.stories || [])
    .filter((s) => !freshUrlSet.has(s.url))
    // CADUCITAT: les notícies surten del lot quan passen de la finestra (4 dies),
    // perquè no s'arrosseguin eternament i fossilitzin la portada.
    .filter(
      (s) => Date.now() - new Date(s.publishedAt).getTime() <= maxLiveStoryAgeMs,
    )
    // Revalidem contra el filtre editorial ACTUAL (si l'hem endurit, les velles
    // que ara no passen cauen aquí en lloc d'arrossegar-se).
    .filter((s) => passesEditorialFilter(`${s.title} ${s.summary || ''}`, s.language).passes)
    .map(({ isFresh: _isFresh, ...rest }) => rest)
  const preDiversity = [...freshStories, ...carryover]
  // Acotem les llengües foranes ABANS de la diversitat per font, perquè el
  // català i el castellà mai no quedin fora encara que un dia hi hagi allau de
  // notícies europees.
  const balanced = capPerLanguage(preDiversity, maxStoriesPerLanguage)
  const finalStories = ensureCategoryCoverage(
    applyDiversityCap(balanced, maxStoriesPerSource, targetStoryLimit),
    balanced,
    targetStoryLimit,
  )

  // Marquem com a "vistes" NOMÉS les noves que de debò entren al lot. Una
  // notícia acceptada que avui queda fora (pel sostre d'una altra llengua o per
  // diversitat de font) segueix sent elegible al pròxim refresc en lloc de
  // cremar-se. Així el català i el castellà no els devora l'allau anglesa.
  const shownFreshUrls = finalStories
    .filter((story) => freshUrlSet.has(story.url))
    .map((story) => story.url)
  if (shownFreshUrls.length > 0) {
    const now = Date.now()
    const updatedSeen = [
      ...seenEntries,
      ...shownFreshUrls.map((url) => ({ url, firstSeenAt: now })),
    ]
    await saveSeenEntries(kv, updatedSeen)
  }

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
