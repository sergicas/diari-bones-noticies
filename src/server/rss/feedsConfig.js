// Catàleg i configuració de fonts RSS per al radar d'El Bon Diari.

// EL GIR EDITORIAL APAGA LES FONTS GENERALISTES (13-08-2026).
//
// El gir va AFEGIR les fonts dels vuit àmbits però no en va treure cap: el
// radar seguia pescant al riu de sempre (premsa local, actualitat espanyola,
// política europea) i la portada s'omplia d'onades de calor i de famosos.
//
// Amb la porta d'aprovació humana això deixava de ser un problema de portada i
// passava a ser un problema de persona: cada matí caldria descartar a mà
// desenes de notícies locals per trobar-hi la peça d'astronomia. Cada dia.
//
// Una font pertany al diari especialitzat si té circuit editorial (A o B). La
// resta es queden al catàleg, apagades: no es perden, i tornar-les a encendre
// és posar aquesta constant a false.
//
// Aquesta constant també governa el sostre per llengua i la rotació de fonts,
// que eren ajustos pensats per a un catàleg de vuitanta mitjans generalistes.
export const NOMES_FONTS_DEL_GIR = true

export const refreshIntervalMs = 12 * 60 * 60 * 1000

// La qualitat editorial passa davant del volum: una edició curta i completa és
// preferible a una portada llarga de breus superficials.
export const targetStoryLimit = 12
export const maxStoriesPerSource = 3
export const collectionPoolSize = 30
// SOSTRE PER LLENGUA D'ORIGEN.
//
// Existia per protegir la portada: amb vuitanta fonts, l'allau de bones
// notícies en anglès ofegava el català i el castellà, que eren la raó de ser
// del diari. Per això l'anglès es quedava en 3 peces per passada.
//
// Amb el gir editorial això es gira del tot: les quinze fonts dels vuit àmbits
// són TOTES estrangeres, i totes les peces s'escriuen en català. L'allau que
// el sostre evitava ja no existeix, i el que feia el sostre era tallar el
// diari sencer a tres peces per passada. Quan només hi ha fonts del gir, no
// s'aplica cap sostre; si es tornen a encendre les generalistes, torna.
export const maxStoriesPerLanguage = NOMES_FONTS_DEL_GIR
  ? {}
  : { es: 6, en: 3, fr: 1, it: 1, pt: 1 }

export const sections = []

// Les fonts d'aquest circuit només serveixen per detectar fets i pistes. La
// peça final sempre és una redacció pròpia en català, sense reutilitzar-ne ni
// el text ni les imatges. Centralitzar-ho evita activar un mitjà editorial amb
// una llicència de reutilització equivocada.
const circuitEditorialOriginal = {
  circuit: 'B',
  reuseLicense: 'Pista: redacció original obligatòria',
  activation: { required: true, licenseConfirmed: true },
}

// Catàleg complet de fonts. El que el radar consulta de debò és `rssFeeds`,
// que es deriva d'aquesta llista just després de tancar-la.
const catalegDeFonts = [
  // ===== PIVOT EDITORIAL: fonts amb llicència comprovable =====
  // Circuit A: la llicència permet traduir/adaptar al català, sempre amb el
  // crèdit i l'enllaç original. La imatge de la institució només es conserva
  // si passa imageRules; en cas contrari, el pipeline torna a la il·lustració
  // editorial pròpia. `activation` s'avalua A CADA passada del radar.
  {
    name: 'NASA',
    url: 'https://www.nasa.gov/news-release/feed/',
    language: 'en',
    outputLanguage: 'ca',
    defaultCategory: 'Ciència',
    forceCategory: true,
    circuit: 'A',
    sourceTopic: 'Astronomia',
    reuseLicense: 'Public domain (NASA)',
    sourceCredit: 'NASA',
    licenseProofUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
    activation: { required: true, licenseConfirmed: true },
    imageRights: { license: 'Public domain', credit: 'NASA' },
  },
  {
    name: 'ESO',
    url: 'https://www.eso.org/public/news/feed/',
    language: 'en',
    outputLanguage: 'ca',
    defaultCategory: 'Ciència',
    forceCategory: true,
    circuit: 'A',
    sourceTopic: 'Astronomia',
    reuseLicense: 'CC BY 4.0',
    sourceCredit: 'ESO',
    licenseProofUrl: 'https://www.eso.org/public/outreach/copyright/',
    activation: { required: true, licenseConfirmed: true },
    imageRights: { license: 'CC BY 4.0', credit: 'ESO' },
  },
  {
    name: 'ESA/Hubble',
    url: 'https://esahubble.org/news/feed/',
    language: 'en',
    outputLanguage: 'ca',
    defaultCategory: 'Ciència',
    forceCategory: true,
    circuit: 'A',
    sourceTopic: 'Astronomia',
    reuseLicense: 'CC BY 4.0',
    sourceCredit: 'ESA/Hubble',
    licenseProofUrl: 'https://esahubble.org/copyright/',
    activation: { required: true, licenseConfirmed: true },
    fetch: { timeoutMs: 12000, maxAttempts: 3, retryDelayMs: 300 },
    imageRights: { license: 'CC BY 4.0', credit: 'ESA/Hubble' },
  },
  {
    name: 'ESA/Webb',
    url: 'https://esawebb.org/news/feed/',
    language: 'en',
    outputLanguage: 'ca',
    defaultCategory: 'Ciència',
    forceCategory: true,
    circuit: 'A',
    sourceTopic: 'Astronomia',
    reuseLicense: 'CC BY 4.0',
    sourceCredit: 'ESA/Webb',
    licenseProofUrl: 'https://esawebb.org/copyright/',
    activation: { required: true, licenseConfirmed: true },
    imageRights: { license: 'CC BY 4.0', credit: 'ESA/Webb' },
  },
  {
    name: 'PLOS Biology',
    url: 'https://journals.plos.org/plosbiology/feed/atom',
    language: 'en',
    outputLanguage: 'ca',
    defaultCategory: 'Ciència',
    circuit: 'A',
    reuseLicense: 'CC BY 4.0',
    sourceCredit: 'PLOS Biology',
    licenseProofUrl: 'https://journals.plos.org/plosbiology/s/journal-information',
    activation: { required: true, licenseConfirmed: true },
    imageRights: { license: 'CC BY 4.0', credit: 'PLOS Biology' },
  },
  {
    name: 'PLOS ONE',
    url: 'https://journals.plos.org/plosone/feed/atom',
    language: 'en',
    outputLanguage: 'ca',
    defaultCategory: 'Ciència',
    circuit: 'A',
    reuseLicense: 'CC BY 4.0',
    sourceCredit: 'PLOS ONE',
    licenseProofUrl: 'https://journals.plos.org/plosone/s/journal-information',
    activation: { required: true, licenseConfirmed: true },
    imageRights: { license: 'CC BY 4.0', credit: 'PLOS ONE' },
  },
  {
    name: 'NIH Research Matters',
    url: 'https://www.nih.gov/news-events/nih-research-matters/feed',
    language: 'en',
    outputLanguage: 'ca',
    defaultCategory: 'Salut',
    circuit: 'A',
    reuseLicense: 'Public domain (NIH)',
    sourceCredit: 'NIH Research Matters',
    licenseProofUrl: 'https://www.nih.gov/about-nih/what-we-do/website-policies#copyright',
    activation: { required: true, licenseConfirmed: true },
    enabled: false,
    disabledReason: 'Cloudflare del NIH retorna HTTP 403 a tots els endpoints oficials provats; pendent de recuperació.',
    imageRights: { license: 'Public domain', credit: 'NIH' },
  },

  // Circuit B: només pistes. El pipeline n'obté fets i enllaç, però sempre
  // escriu una peça original en català; mai no reutilitza el text ni la imatge.
  {
    name: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/', language: 'en', outputLanguage: 'ca', defaultCategory: 'Ciència',
    circuit: 'B', reuseLicense: 'Pista: redacció original obligatòria', activation: { required: true, licenseConfirmed: true },
  },
  {
    name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', language: 'en', outputLanguage: 'ca', defaultCategory: 'Tecnologia',
    circuit: 'B', reuseLicense: 'Pista: redacció original obligatòria', activation: { required: true, licenseConfirmed: true },
  },
  {
    name: 'Aeon', url: 'https://aeon.co/feed.rss', language: 'en', outputLanguage: 'ca', defaultCategory: 'Cultura',
    circuit: 'B', reuseLicense: 'Pista: redacció original obligatòria', activation: { required: true, licenseConfirmed: true },
  },
  {
    name: 'Psyche', url: 'https://psyche.co/feed', language: 'en', outputLanguage: 'ca', defaultCategory: 'Cultura',
    circuit: 'B', sourceTopic: 'Filosofia', reuseLicense: 'Pista: redacció original obligatòria', activation: { required: true, licenseConfirmed: true },
  },
  {
    name: 'Daily Nous', url: 'https://dailynous.com/feed/', language: 'en', outputLanguage: 'ca', defaultCategory: 'Cultura',
    circuit: 'B', sourceTopic: 'Filosofia', reuseLicense: 'Pista: redacció original obligatòria', activation: { required: true, licenseConfirmed: true },
  },
  {
    name: 'Literary Hub', url: 'https://lithub.com/feed/', language: 'en', outputLanguage: 'ca', defaultCategory: 'Cultura',
    circuit: 'B', sourceTopic: 'Literatura', reuseLicense: 'Pista: redacció original obligatòria', activation: { required: true, licenseConfirmed: true },
  },
  {
    name: 'The Paris Review', url: 'https://www.theparisreview.org/blog/feed/', language: 'en', outputLanguage: 'ca', defaultCategory: 'Cultura',
    circuit: 'B', sourceTopic: 'Literatura', reuseLicense: 'Pista: redacció original obligatòria', activation: { required: true, licenseConfirmed: true },
  },
  {
    name: 'Electric Literature', url: 'https://electricliterature.com/feed/', language: 'en', outputLanguage: 'ca', defaultCategory: 'Cultura',
    circuit: 'B', sourceTopic: 'Literatura', reuseLicense: 'Pista: redacció original obligatòria', activation: { required: true, licenseConfirmed: true },
  },
  {
    name: 'Public Domain Review', url: 'https://publicdomainreview.org/feed/', language: 'en', outputLanguage: 'ca', defaultCategory: 'Cultura',
    circuit: 'B', sourceTopic: 'Literatura', reuseLicense: 'Pista: redacció original obligatòria', activation: { required: true, licenseConfirmed: true },
  },
  // Mentrestant NIH és fora: Longevitat només té pistes Circuit B. El model
  // redacta una peça original i no reutilitza text ni imatge de STAT.
  {
    name: 'STAT', url: 'https://www.statnews.com/feed/', language: 'en', outputLanguage: 'ca', defaultCategory: 'Salut',
    circuit: 'B', reuseLicense: 'Pista: redacció original obligatòria', activation: { required: true, licenseConfirmed: true },
  },
  // Cerca viva d'articles de longevitat a Europe PMC. La consulta restringeix
  // el catàleg a PMC OA amb CC BY; el parser torna a comprovar la llicència i
  // que sigui un Journal Article abans que una peça pugui entrar al pipeline.
  {
    name: 'Europe PMC · Longevitat',
    url: 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=TITLE%3Alongevity%20AND%20OPEN_ACCESS%3AY%20AND%20IN_PMC%3AY%20AND%20LICENSE%3A%22CC%20BY%22%20sort_date%3Ay&format=xml&resultType=core&pageSize=20',
    format: 'europe-pmc-search',
    language: 'en',
    outputLanguage: 'ca',
    defaultCategory: 'Salut',
    circuit: 'A',
    sourceTopic: 'Longevitat',
    reuseLicense: 'CC BY (validada individualment per Europe PMC)',
    sourceCredit: 'Europe PMC i autoria de l’estudi',
    licenseProofUrl: 'https://europepmc.org/developers',
    activation: { required: true, licenseConfirmed: true },
  },
  // ===== FONTS AMPLIADES (jul. 2026): proximitat CAT, estatal i europeu =====
  { name: 'El 9 Nou Osona', url: 'https://el9nou.cat/feed/?post_type=post&edicio=osona-ripolles', language: 'ca', defaultCategory: 'Comarcal' },
  { name: 'El 9 Nou Valles', url: 'https://el9nou.cat/feed/?post_type=post&edicio=valles-oriental', language: 'ca', defaultCategory: 'Comarcal' },
  { name: 'AnoiaDiari', url: 'https://www.anoiadiari.cat/rss', language: 'ca', defaultCategory: 'Comarcal' },
  { name: "La Veu de l'Anoia", url: 'https://veuanoia.cat/feed/', language: 'ca', defaultCategory: 'Comarcal' },
  { name: "L'Independent de Gracia", url: 'https://www.independent.cat/rss', language: 'ca', defaultCategory: 'Local' },
  { name: 'Diari Mes', url: 'https://www.diarimes.com/ca/rss/home.xml', language: 'ca', defaultCategory: 'Comarcal' },
  { name: 'Aguaita', url: 'https://www.aguaita.cat/rss', language: 'ca', defaultCategory: 'Comarcal' },
  { name: 'Segre', url: 'https://www.segre.com/ca/rss/home.xml', language: 'ca', defaultCategory: 'Comarcal' },
  { name: 'La Directa', url: 'https://directa.cat/feed/', language: 'ca', defaultCategory: 'Societat' },
  { name: 'elDiario.es', url: 'https://www.eldiario.es/rss/', language: 'es', defaultCategory: 'Actualitat' },
  { name: 'El Periodico', url: 'https://www.elperiodico.com/es/rss/sociedad/rss.xml', language: 'es', defaultCategory: 'Actualitat' },
  { name: 'Newtral', url: 'https://www.newtral.es/feed/', language: 'es', defaultCategory: 'Societat' },
  { name: 'The Local Spain', url: 'https://feeds.thelocal.com/rss/es', language: 'en', defaultCategory: 'Actualitat' },
  { name: 'POLITICO Europe', url: 'https://www.politico.eu/feed/', language: 'en', defaultCategory: 'Politica' },

  // NOTA: només fonts GRATUÏTES/obertes. S'han tret els mitjans amb subscripció
  // o mur de pagament (ARA, El Punt Avui, Diari de Tarragona, El País, La
  // Vanguardia, ABC, El Mundo, El Español, NYT, WaPo, WSJ, FT, Bloomberg, Le
  // Monde, la Repubblica, Observador…). Vegeu l'historial de git per la llista
  // completa del que s'ha retirat.
  // ===================== CATALÀ =====================
  { name: 'Vilaweb', url: 'https://www.vilaweb.cat/feed/', language: 'ca', defaultCategory: 'Actualitat', core: true },
  { name: 'Nació Digital', url: 'https://www.naciodigital.cat/rss/', language: 'ca', defaultCategory: 'Actualitat', core: true },
  { name: 'El Món', url: 'https://elmon.cat/feed/', language: 'ca', defaultCategory: 'Actualitat' },
  // Local de Mataró i el Maresme (Capgròs). Categoria forçada a 'Local'.
  { name: 'Capgròs', url: 'https://capgros.elnacional.cat/uploads/feeds/feed_ca.xml', language: 'ca', defaultCategory: 'Local', forceCategory: true, lenient: true, core: true },
  { name: 'Betevé', url: 'https://beteve.cat/feed/', language: 'ca', defaultCategory: 'Barcelona' },
  { name: 'Crític', url: 'https://www.elcritic.cat/feed', language: 'ca', defaultCategory: 'Periodisme' },
  // Primer format de servei que amplia Bondiari més enllà de la notícia
  // positiva. És un feed íntegrament dedicat a verificacions: no passa pel
  // filtre de "bondat", sinó per la confiança editorial de la font.
  {
    name: 'Verificat',
    url: 'https://www.verificat.cat/feed/',
    language: 'ca',
    defaultCategory: 'Verificació',
    forceCategory: true,
    editorialMode: 'verification',
    sourceTier: 'B',
    core: true,
  },

  // ---- Seccions que el català no cobria (afegides el 27-07-2026) ----
  // El catàleg tenia 16 fonts en català i 8 eren premsa comarcal: no hi havia
  // NI UNA font catalana de ciència, salut ni educació, que són justament les
  // seccions que l'informe diari marcava en vermell. Rendiment comprovat amb el
  // codi real del radar abans d'afegir-les (peces que passen el filtre sobre el
  // total del feed): Mètode 5/10, Diari de la Sanitat 8/10, Educació 7/10.
  {
    name: 'Mètode',
    url: 'https://metode.cat/feed',
    language: 'ca',
    defaultCategory: 'Ciència',
    forceCategory: true,
    sourceTopic: 'Ciència',
    ...circuitEditorialOriginal,
  },
  {
    name: 'Diari de la Sanitat',
    url: 'https://diarisanitat.cat/feed/',
    language: 'ca',
    defaultCategory: 'Salut',
    forceCategory: true,
    sourceTopic: 'Salut',
    ...circuitEditorialOriginal,
  },
  // Gent que treballa pels altres. De setze organitzacions provades el
  // 27-07-2026, l'única catalana amb feed viu i peces que entren (2/10).
  // Metges Sense Fronteres, Open Arms i Creu Roja ja no mantenen RSS públic;
  // Amnistia en té, però publica denúncia i cap peça no passa el filtre.
  {
    name: 'Casal dels Infants',
    url: 'https://www.casaldelsinfants.org/feed/',
    language: 'ca',
    defaultCategory: 'Solidaritat',
    forceCategory: true,
    sourceTopic: 'Solidaritat',
    ...circuitEditorialOriginal,
  },
  {
    name: "Diari de l'Educació",
    url: 'https://diarieducacio.cat/feed/',
    language: 'ca',
    defaultCategory: 'Educació',
    forceCategory: true,
    sourceTopic: 'Educació',
    ...circuitEditorialOriginal,
  },

  // ===================== CASTELLÀ (només obert/gratuït) =====================
  { name: 'RTVE', url: 'https://www.rtve.es/rss/temas_noticias.xml', language: 'es', defaultCategory: 'Espanya', core: true },
  { name: '20minutos', url: 'https://www.20minutos.es/rss/', language: 'es', defaultCategory: 'Espanya' },
  // Agències / serveis d'informació gratuïts (RSS oficial verificat).
  { name: 'Europa Press', url: 'https://www.europapress.es/rss/rss.aspx', language: 'es', defaultCategory: 'Espanya' },
  { name: 'UN News', url: 'https://news.un.org/feed/subscribe/es/news/all/rss.xml', language: 'es', defaultCategory: 'Món' },
  // Afegides el 10/08/2026 perquè Ciència i Tecnologia depenien només de
  // fonts en anglès (rotatòries, ~1 cop cada 5 dies) i es quedaven seques; el
  // castellà, com el català, es consulta SENCER a cada passada. Sense
  // forceCategory perquè cobreixen molts temes (o, a Xataka, també
  // curiositats no tecnològiques): la categoria final la decideix el
  // contingut real del titular (classifyAllowedEditorialTopic), no l'etiqueta
  // de la font. Provades a mà (10/08/2026): fresques, sense articles morts;
  // Xataka té alguna oferta comercial ocasional, ja coberta pel filtre
  // d'advertorial/paraules d'oferta existent.
  { name: 'The Conversation (ES)', url: 'https://theconversation.com/es/articles.atom', language: 'es', defaultCategory: 'Coneixement', sourceTopic: 'Coneixement', ...circuitEditorialOriginal },
  { name: 'Xataka', url: 'https://www.xataka.com/index.xml', language: 'es', defaultCategory: 'Actualitat' },

  // ===================== ANGLÈS =====================
  { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', language: 'en', defaultCategory: 'Món', core: true },
  // Diaris de bones notícies (ja curats: passen sense exigir paraula positiva).
  { name: 'Positive News', url: 'https://www.positive.news/feed/', language: 'en', defaultCategory: 'Món', lenient: true, curated: true, core: true, sourceTopic: 'Solucions', ...circuitEditorialOriginal },
  { name: 'Good News Network', url: 'https://www.goodnewsnetwork.org/feed/', language: 'en', defaultCategory: 'Món', lenient: true, curated: true, sourceTopic: 'Solucions', ...circuitEditorialOriginal },
  { name: 'Reasons to be Cheerful', url: 'https://reasonstobecheerful.world/feed/', language: 'en', defaultCategory: 'Món', lenient: true, curated: true, sourceTopic: 'Solucions', ...circuitEditorialOriginal },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', language: 'en', defaultCategory: 'Món' },
  { name: 'CNN', url: 'http://rss.cnn.com/rss/edition.rss', language: 'en', defaultCategory: 'Món' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'Sky News', url: 'https://feeds.skynews.com/feeds/rss/world.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'The Independent', url: 'https://www.independent.co.uk/news/world/rss', language: 'en', defaultCategory: 'Món' },
  { name: 'The Conversation', url: 'https://theconversation.com/articles.atom', language: 'en', defaultCategory: 'Coneixement', sourceTopic: 'Coneixement', ...circuitEditorialOriginal },
  { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', language: 'en', defaultCategory: 'Ciència', forceCategory: true, sourceTopic: 'Ciència', ...circuitEditorialOriginal },
  {
    name: 'Phys.org', url: 'https://phys.org/rss-feed/', language: 'en', outputLanguage: 'ca', defaultCategory: 'Ciència', forceCategory: true,
    circuit: 'B', reuseLicense: 'Pista: redacció original obligatòria', activation: { required: true, licenseConfirmed: true },
  },
  { name: 'BBC Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', language: 'en', defaultCategory: 'Ciència', forceCategory: true, sourceTopic: 'Ciència', ...circuitEditorialOriginal },
  { name: 'Guardian Science', url: 'https://www.theguardian.com/science/rss', language: 'en', defaultCategory: 'Ciència', forceCategory: true, sourceTopic: 'Ciència', ...circuitEditorialOriginal },
  { name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', language: 'en', defaultCategory: 'Tecnologia', forceCategory: true, sourceTopic: 'Tecnologia', ...circuitEditorialOriginal },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', language: 'en', defaultCategory: 'Tecnologia', forceCategory: true },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', language: 'en', defaultCategory: 'Tecnologia', forceCategory: true },
  { name: 'Guardian Culture', url: 'https://www.theguardian.com/culture/rss', language: 'en', defaultCategory: 'Cultura', forceCategory: true, sourceTopic: 'Cultura', ...circuitEditorialOriginal },
  { name: 'Smithsonian', url: 'https://www.smithsonianmag.com/rss/latest_articles/', language: 'en', defaultCategory: 'Cultura', forceCategory: true, sourceTopic: 'Cultura', ...circuitEditorialOriginal },
  { name: 'Euronews', url: 'https://www.euronews.com/rss?level=theme&name=news', language: 'en', defaultCategory: 'Europa' },

  // ===================== PORTUGUÈS (només obert/gratuït) =====================
  { name: 'RTP Notícias', url: 'https://www.rtp.pt/noticias/rss', language: 'pt', defaultCategory: 'Món', core: true },
  { name: 'CNN Portugal', url: 'https://cnnportugal.iol.pt/rss', language: 'pt', defaultCategory: 'Món' },
  { name: 'G1', url: 'https://g1.globo.com/rss/g1/', language: 'pt', defaultCategory: 'Món' },
  { name: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', language: 'pt', defaultCategory: 'Món' },

  // ===================== FRANCÈS (només obert/gratuït) =====================
  { name: 'France 24', url: 'https://www.france24.com/fr/rss', language: 'fr', defaultCategory: 'Europa', core: true },
  { name: 'Positivr', url: 'https://positivr.fr/feed/', language: 'fr', defaultCategory: 'Europa', lenient: true, curated: true },
  { name: 'RFI', url: 'https://www.rfi.fr/fr/rss', language: 'fr', defaultCategory: 'Europa' },
  { name: '20 Minutes', url: 'https://www.20minutes.fr/feeds/rss-une.xml', language: 'fr', defaultCategory: 'Europa' },
  { name: 'Franceinfo', url: 'https://www.francetvinfo.fr/titres.rss', language: 'fr', defaultCategory: 'Europa' },

  // ===================== ITALIÀ (només obert/gratuït) =====================
  { name: 'ANSA', url: 'https://www.ansa.it/sito/ansait_rss.xml', language: 'it', defaultCategory: 'Europa', core: true },
  { name: 'Rai News', url: 'https://www.rainews.it/rss/tutti', language: 'it', defaultCategory: 'Europa' },
  { name: 'Il Fatto Quotidiano', url: 'https://www.ilfattoquotidiano.it/feed/', language: 'it', defaultCategory: 'Europa' },
  { name: 'Open', url: 'https://www.open.online/feed/', language: 'it', defaultCategory: 'Europa' },
  { name: 'ANSA Cultura', url: 'https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml', language: 'it', defaultCategory: 'Cultura', forceCategory: true },
]

// Quantes fonts NO-core s'afegeixen per llengua a cada passada.
//
// La rotació estreta original (ca:5, es:3) existia per no passar de les ~50
// subpeticions del pla GRATUÏT de Cloudflare. Amb les cues i D1 desplegades el
// projecte ja és al pla de pagament, on el límit és de 1.000: la restricció que
// justificava deixar 37 de les 60 fonts sense consultar ja no existeix.
//
// Ara es consulten TOTES les fonts en català i en castellà a cada passada, i es
// manté la rotació a la resta. El motiu és el sostre per llengua de la portada:
// el català no en té i el castellà arriba a 6, però l'anglès es queda en 3 i el
// francès, l'italià i el portuguès en 1. Baixar més fonts angleses no ompliria
// la portada —només faria rotar la mateixa plaça única—, mentre que l'oferta en
// català sí que hi entra sencera. Mesurat el 27-07-2026: de 121 peces aprovades
// per passada només 3 eren catalanes, i la portada es quedava encallada en 5.
// EL GIR EDITORIAL APAGA LES FONTS GENERALISTES (13-08-2026).
//
// El gir va AFEGIR les fonts dels vuit àmbits però no en va treure cap: el
// radar seguia pescant al riu de sempre (premsa local, actualitat espanyola,
// política europea) i la portada s'omplia d'onades de calor i de famosos.
//
// Amb la porta d'aprovació humana això deixa de ser un problema de portada i
// passa a ser un problema de persona: cada matí caldria descartar a mà desenes
// de notícies locals per trobar-hi la peça d'astronomia. Cada dia.
//
// L'interruptor NOMES_FONTS_DEL_GIR és a dalt de tot del fitxer, perquè també
// governa el sostre per llengua, que es declara abans que aquesta llista.
export const rssFeeds = catalegDeFonts.map((feed) =>
  NOMES_FONTS_DEL_GIR && !feed.circuit ? { ...feed, enabled: false } : feed,
)

const fontsNoCore = (language) =>
  rssFeeds.filter((feed) => feed.enabled !== false && feed.language === language && !feed.core).length

// Per sota d'aquest nombre de fonts enceses, consultar-les totes a cada passada
// cap de sobres dins del sostre de subpeticions, i rotar només faria mal.
// El projecte ja és al pla de pagament: 40 fonts encara queden molt per sota
// del sostre de 1.000 subpeticions, i mantenir-les totes a cada passada evita
// que afegir una font humanística torni a activar accidentalment la rotació
// estreta de dues fonts angleses.
const MAX_FONTS_SENSE_ROTACIO = 40
const senseRotacio =
  rssFeeds.filter((feed) => feed.enabled !== false).length <= MAX_FONTS_SENSE_ROTACIO

export const rotatingPerLanguage = {
  // El català i el castellà es calculen del catàleg, no es fixen a mà: així,
  // afegir una font nova no en deixa cap fora en silenci. (Va passar en afegir
  // Mètode, Sanitat i Educació amb el número escrit a mà: les tres últimes
  // catalanes deixaven de consultar-se i només ho va cantar la prova.)
  // Els números escrits a mà (en: 2, fr: 1...) venien de quan el catàleg tenia
  // vuitanta fonts i calia repartir-les entre passades per no passar del sostre
  // de subpeticions del pla gratuït de Cloudflare (~50 per refresc).
  //
  // Amb el gir, el catàleg encès ha passat de 80 fonts a poc més de 30, i totes són en
  // anglès. Amb els números vells, cada passada n'hauria consultat DUES: Europe
  // PMC (l'única font de Longevitat) s'hauria mirat un cop per setmana. Per
  // això, quan el catàleg encès és petit, no es rota res i es consulten totes.
  ca: fontsNoCore('ca'),
  es: fontsNoCore('es'),
  en: senseRotacio ? fontsNoCore('en') : 2,
  fr: senseRotacio ? fontsNoCore('fr') : 1,
  it: senseRotacio ? fontsNoCore('it') : 1,
  pt: senseRotacio ? fontsNoCore('pt') : 1,
}

export const serviceSourceNames = [
  'Agenda Cultural',
  'Dades Obertes de Catalunya · RAISC',
  'Idescat',
]

export const allowedSourceNames = new Set([
  ...rssFeeds.map((feed) => feed.name),
  ...serviceSourceNames,
])

export function selectFeedsForRun(nowMs) {
  const enabledFeeds = rssFeeds.filter((feed) => feed.enabled !== false)
  const core = enabledFeeds.filter((feed) => feed.core)
  const tick = Math.floor(nowMs / refreshIntervalMs)
  const seen = new Set(core.map((feed) => feed.url))
  const picked = []
  for (const [language, count] of Object.entries(rotatingPerLanguage)) {
    const pool = enabledFeeds.filter(
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

export const tickerFeedNames = ['Vilaweb', 'Nació Digital', 'Betevé', 'Capgròs', 'El Món', 'Crític']
