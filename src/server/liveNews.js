// Radar en viu de bondiari.com: combina el scraping de 3cat amb una vintena
// de RSS catalans, espanyols, anglosaxons i europeus, aplica filtres
// editorials per idioma i guarda el resultat a Workers KV (env.LIVE_NEWS_KV).

import { LIVE_EDITORIAL_VERSION } from '../lib/editorial-version.js'
import {
  ALLOWED_EDITORIAL_TOPICS,
  keepAllowedEditorialTopic,
  normalizeCategory,
  refineCategoryByContent,
} from '../lib/category.js'
import { storyImagePath } from '../lib/story-image-path.js'
import { applyOwnContent } from './storyText.js'
import { runTextModel, activeTextProvider } from './ai/textModel.js'
import { attachRealPhotos, sanitizeStoryPhotos } from './storyPhoto.js'
import { isValidConfiguredFeedXml, validateFeedActivation } from './rss/feedActivation.js'
import {
  selectPublishableStories,
} from './editorialQuality.js'
import { feedStoryId } from '../lib/story-id.js'
import {
  refreshIntervalMs,
  targetStoryLimit,
  maxStoriesPerSource,
  collectionPoolSize,
  maxStoriesPerLanguage,
  sections,
  rssFeeds,
  allowedSourceNames,
  selectFeedsForRun,
  tickerFeedNames,
  NOMES_FONTS_DEL_GIR,
} from './rss/feedsConfig.js'
import {
  normalizeAgendaItem,
  collectAgendaStories,
  normalizeRaiscOpportunity,
  collectRaiscOpportunities,
  normalizeIdescatUpdate,
  collectIdescatUpdates,
} from './rss/serviceFeeds.js'
import {
  candidateId,
  readDecisions,
  recordPendingCandidates,
  splitByReviewDecision,
} from './reviewGate.js'

export {
  refreshIntervalMs,
  normalizeAgendaItem,
  normalizeRaiscOpportunity,
  normalizeIdescatUpdate,
}

// Les peces publicades es desen també sota una clau estable story:<id> perquè la
// seva pàgina de detall es pugui resoldre encara que surtin de la portada (finestra
// de 30 peces / 4 dies). Així els enllaços compartits o indexats no fan 404.
const storyDetailTtlSeconds = 30 * 24 * 60 * 60

const cacheKey = 'latest'
// El Bon Diari és un DIARI: el radar només manté notícies de pocs dies. Una
// finestra llarga deixava que notícies velles amb moltes paraules positives
// dominessin la portada eternament. 5 dies (25-07-2026, abans 4) = prou marge
// per a seccions lentes (ciència, cultura) sense fossilitzar-se. La portada en
// mostra fins a 25 peces de < 5 dies (App.jsx); la resta va a l'Hemeroteca.
const maxLiveStoryAgeMs = 5 * 24 * 60 * 60 * 1000

// CADA ÀMBIT TÉ EL SEU RELLOTGE (13-08-2026).
//
// Els cinc dies de dalt es van posar quan això era un radar de bones notícies
// generals: allà, una notícia de fa una setmana ja no serveix. Un diari
// especialitzat no funciona així. Un estudi de longevitat amb revisió
// d'experts no caduca en cinc dies, i un assaig de filosofia encara menys.
//
// Sense això, Longevitat es quedava buit per sempre i en silenci: la font
// d'Europe PMC passa totes les comprovacions, però serveix estudis de sis
// setmanes enrere i el radar els llençava tots abans d'ensenyar-los.
//
// El risc conegut d'allargar finestres és fossilitzar la portada (ja va passar
// el 2026-06 amb una finestra de 60 dies). Ara hi ha dos frens que aleshores no
// existien: les peces d'aquests àmbits no es publiquen soles —passen per la
// sala de revisió— i el lot lidera sempre les d'avui.
//
// Són vuit números i es poden canviar sense tocar res més.
const maxLiveStoryAgeDaysByTopic = {
  Longevitat: 60,
  Astronomia: 30,
  Biotecnologia: 30,
  Filosofia: 30,
  Literatura: 30,
  Ciència: 14,
  IA: 10,
  Tecnologia: 10,
}
function maxLiveStoryAgeMsByTopic(topic) {
  const days = maxLiveStoryAgeDaysByTopic[topic]
  return days ? days * 24 * 60 * 60 * 1000 : 0
}

export function isStoryWithinLiveWindow(story, now = Date.now()) {
  if (story?.expiresAt) {
    const rawExpiry = String(story.expiresAt)
    const parsedExpiry = new Date(rawExpiry).getTime()
    if (!Number.isNaN(parsedExpiry)) {
      // Els datasets oficials solen representar el termini com les 00:00 del
      // dia indicat. Editorialment és vigent fins al final d'aquell dia.
      const endOfListedDay = /T00:00:00(?:\.000)?(?:Z)?$/.test(rawExpiry)
        ? parsedExpiry + 24 * 60 * 60 * 1000 - 1
        : parsedExpiry
      return endOfListedDay >= now
    }
  }
  const publishedAt = new Date(story?.publishedAt).getTime()
  const maxAgeByFormat = {
    verification: 45 * 24 * 60 * 60 * 1000,
    data: 365 * 24 * 60 * 60 * 1000,
  }
  const maxAge =
    maxAgeByFormat[story?.editorialFormat] ||
    maxLiveStoryAgeMsByTopic(story?.topic) ||
    maxLiveStoryAgeMs
  return (
    !Number.isNaN(publishedAt) &&
    now - publishedAt <= maxAge
  )
}
const liveEditorialVersion = LIVE_EDITORIAL_VERSION

// Decideix si una peça que ja és al lot s'hi pot quedar al refresc següent.
//
// El porter editorial (passesEditorialFilter) NO es pot tornar a passar aquí:
// una peça publicada ja no conserva el text amb què es va jutjar. El titular
// està reescrit i el resum s'esborra a applyOwnContent (summary = '') per no
// reproduir el text del mitjà. Revalidar el titular reescrit tot sol feia caure
// gairebé tot —un titular rarament du paraula positiva— i les peces rescatades
// per la IA no en sobrevivien mai, perquè aquella revisió només mirava paraules
// clau i no consultava el veredicte. Efecte observat el 27-07-2026: el lot no
// acumulava i cada refresc tornava a començar de zero (10 peces → 7 en tres
// minuts).
//
// La decisió editorial ja es va prendre quan la peça va entrar, amb el text
// sencer i amb la IA. Aquí només comprovem que les REGLES no hagin canviat des
// de llavors, i la marca editorialVersion és exactament aquest senyal: per
// endurir el filtre cal pujar LIVE_EDITORIAL_VERSION, i llavors el lot sencer
// es renova sota les regles noves.
export function keepsEditorialClearance(story, currentVersion) {
  // Els formats de servei (verificacions, dades, agenda, oportunitats) no
  // passen pel porter de positivitat: hi confiem per la font.
  if (story?.editorialFormat && story.editorialFormat !== 'constructive') {
    return true
  }
  return story?.editorialVersion === currentVersion
}

// --- Diccionaris editorials per idioma -------------------------------------
// CRITERI de les paraules POSITIVES: només hi entren mots que denoten BONDAT en
// si mateixa (premi, salva, inaugura, descobreix, solidaritat...). S'eviten els
// verbs DIRECCIONALS o neutres que poden ser bons o dolents segons el context
// —creix ("creix l'atur"), amplia ("amplia la condemna"), obre ("obre una
// investigació"), arriba ("arriben pasteres"), aposta/aporta, mostra—: aquests
// es treuen, de manera que la notícia queda NEUTRA i només surt si la IA
// l'aprova, en lloc de colar-se per una paraula positiva incidental (29/06).

const editorialDictionaries = {
  ca: {
    positive: [
      'èxit', 'recupera', 'recuperen', 'aconsegueix', 'aconsegueixen',
      'ajuda', 'ajuden', 'solidaritat', 'solidari', 'solidària',
      'millora', 'milloren', 'estrena', 'estrenen', 'guanya', 'guanyen',
      'pioner', 'pionera', 'avança', 'avancen',
      'acollida', 'acolliment', 'renaixement', 'ajut', 'donació', 'salva',
      'salven', 'premi', 'premiat', 'premiada', 'protecció', 'protegeix',
      'protegeixen', 'restaura', 'restauren', 'rehabilita', 'rehabiliten',
      'gratuït', 'gratuïta', 'inclusió', 'inclusiu', 'inclusiva',
      'referent', 'voluntari', 'voluntària', 'voluntariat',
      'neix', 'neixen', 'celebra', 'celebren', 'inaugura', 'inauguren',
      'descobreix', 'descoberta', 'descobreixen', 'rècord', 'fita',
      'reconeix', 'reconegut', 'reconeguda', 'reconeixement', 'homenatge',
      'guardó', 'guardonat', 'guardonada', 'iniciativa', 'projecte',
      'recerca', 'consolida', 'compromís',
      'esperança', 'innovació', 'innovador', 'innovadora', 'cooperació',
      'col·laboració', 'sostenible', 'sostenibilitat', 'transforma',
      'transformació', 'reviu', 'reviuen',
      'positiu', 'positiva', 'històric', 'històrica',
      'aprova', 'aprovat', 'aprovada', 'aprovació',
      // Cultura i ciència (contingut constructiu que sovint no diu "guanya"):
      'exposició', 'novel·la', 'pel·lícula', 'llibre', 'museu', 'festival',
      'concert', 'estudi', 'troballa', 'documental', 'biografia',
      'poemari', 'disc', 'retrospectiva', 'estrena', 'recital',
      'nobel', 'avenç', 'invent', 'patent', 'vacuna', 'renovable', 'prototip',
      // GENT QUE TREBALLA PELS ALTRES (27-07-2026). El diccionari sabia dir
      // "premi", "inaugura" o "descobreix" i no tenia CAP paraula per a rescatar,
      // acollir o fer voluntariat: "Open Arms rescata 200 persones al Mediterrani"
      // no el bloquejava ningú, però tampoc no el reconeixia ningú, i només
      // entrava si la IA el rescatava. Les grans ONG ja no mantenen RSS, així que
      // aquestes històries s'han de trobar als mitjans que el radar ja llegeix.
      //
      // NOMÉS ACCIONS, no marcadors de tema. Provat el 27-07-2026: afegir-hi
      // "acull" feia bona notícia de "Barcelona acull el Congrés Mundial de
      // Mòbils" i de qualsevol estadi que aculli una final; i afegir-hi el nom
      // de les organitzacions convertia en bona notícia "La Creu Roja alerta de
      // l'augment de la pobresa infantil". Un nom d'ONG diu de què va la peça,
      // no si és bona: aquestes queden neutres i les valora la IA, que és el
      // que toca.
      'rescata', 'rescaten', 'rescatat', 'rescatada', 'rescatats', 'rescatades',
      'humanitari', 'humanitària', 'cooperant', 'cooperants',
      'altruis', 'apadrin', 'donants',
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
      // Clickbait de bellesa/dieta (paral·lel al castellà "celulitis").
      'cel·lulitis', 'aprimar', 'perdre pes', 'rejovenir', 'antiarrugues',
      'flaccidesa',
      // Retallades de programes/ajuts i pujades de taxes: la notícia és una
      // pèrdua encara que hi surti "projecte", "estudi" o "escola" (paral·lel a
      // l'anglès "axed"/"soaring fees", colats el 04/07).
      'retallada', 'retallades', 'retall pressupostari', 'tancament del programa',
      'suprimeix el programa', 'pugen les taxes', 'taxes universitàries',
    ],
  },
  es: {
    positive: [
      'éxito', 'recupera', 'recuperan', 'logra', 'logran', 'consigue',
      'consiguen', 'ayuda', 'ayudan', 'solidaridad', 'solidario',
      'solidaria', 'mejora', 'mejoran', 'estrena', 'estrenan', 'gana',
      'ganan', 'pionero', 'pionera', 'avanza',
      'avanzan', 'acoge', 'acogida', 'donación', 'salva', 'salvan',
      'premio', 'premiado', 'premiada', 'protege', 'protegen', 'restaura',
      'restauran', 'rehabilita', 'rehabilitan', 'gratuito', 'gratuita',
      'inclusión', 'inclusivo', 'inclusiva', 'referente', 'voluntario',
      'voluntaria', 'voluntariado', 'nace', 'nacen', 'celebra', 'celebran',
      'inaugura', 'inauguran', 'descubre', 'descubren', 'descubrimiento',
      'récord', 'hito', 'reconoce', 'reconocido', 'reconocida',
      'reconocimiento', 'homenaje', 'galardón', 'galardonado',
      'galardonada', 'iniciativa', 'proyecto', 'investigación',
      'consolida', 'compromiso', 'esperanza',
      'innovación', 'innovador', 'innovadora', 'cooperación',
      'colaboración', 'sostenible', 'sostenibilidad', 'transforma',
      'transformación', 'revive',
      'reviven', 'positivo', 'positiva', 'histórico', 'histórica',
      'aprueba', 'aprobado', 'aprobada', 'aprobación',
      // Cultura y ciencia (contenido constructivo sin "gana/récord"):
      'exposición', 'novela', 'película', 'libro', 'museo', 'festival',
      'concierto', 'estudio', 'hallazgo', 'documental', 'biografía',
      'poemario', 'disco', 'retrospectiva', 'resucita', 'recital',
      'nobel', 'avance', 'invento', 'patente', 'vacuna', 'renovable', 'prototipo',
      // Gente que trabaja por los demás (vegeu la nota al diccionari català).
      'rescata', 'rescatan', 'rescatado', 'rescatada', 'rescatados',
      'humanitario', 'humanitaria', 'cooperante', 'cooperantes',
      'altruis', 'apadrin', 'donantes',
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
      // Clickbait de belleza/dieta (colat el 29/06: "La celulitis se puede eliminar").
      'celulitis', 'adelgazar', 'perder peso', 'rejuvenecer', 'antiarrugas',
      'flacidez',
      // Recortes de programas/ayudas y subidas de tasas: la noticia es una
      // pérdida aunque salga "proyecto", "estudio" o "escuela" (paralelo al
      // inglés "axed"/"soaring fees", colados el 04/07).
      'recorte', 'recortes', 'tijeretazo', 'cierre del programa',
      'suprime el programa', 'suben las tasas', 'tasas universitarias',
    ],
  },
  en: {
    positive: [
      'success', 'succeeds', 'achievement', 'achieves', 'helps', 'help ',
      'solidarity', 'improves', 'wins', 'won ',
      'pioneer', 'pioneering', 'advances', 'welcomes', 'breakthrough',
      'donation', 'saves', 'rescue', 'rescued', 'prize', 'award',
      'awarded', 'protects', 'restores', 'restored', 'rehabilitates',
      'free of charge', 'inclusion', 'inclusive', 'volunteer', 'born',
      'celebrates', 'inaugurates', 'discovers', 'discovery', 'record',
      'milestone', 'recognized', 'recognised', 'recognition', 'tribute',
      'initiative', 'project', 'research', 'consolidates', 'commitment',
      'hope', 'hopeful', 'innovation', 'innovative',
      'cooperation', 'collaboration', 'sustainable', 'sustainability',
      'transforms', 'revives', 'positive',
      'historic', 'approves', 'approved', 'approval', 'contributes',
      'launches', 'launched', 'celebrated', 'partnership', 'partnerships',
      'recovery', 'recovers',
      // Culture and science (constructive content without "wins/record"):
      'exhibition', 'novel', 'film', 'book', 'museum', 'festival', 'concert',
      'study', 'discovery', 'documentary', 'biography', 'retrospective',
      'nobel', 'patent', 'invention', 'vaccine', 'renewable', 'prototype',
      // People working for others (see the note in the Catalan dictionary).
      'rescue', 'humanitarian', 'aid worker', 'aid workers',
      'donors',
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
      // Programes bons que es retallen/cancel·len i pujades de preus/taxes: la
      // notícia és una PÈRDUA, encara que hi surti "project", "study" o "school"
      // (colat el 04/07 amb "education project... axed by UK" i "Brexit... soaring
      // student fees"). "study/project" són paraula positiva; sense aquests
      // negatius, passaven el filtre i s'arrossegaven quatre dies.
      'axed', 'scrapped', 'aid cut', 'aid cuts', 'funding cut', 'funding cuts',
      'budget cut', 'budget cuts', 'priced out', 'soaring fees', 'soaring costs',
      'soaring prices', 'student fees', 'tuition fees', 'fee rise', 'fee hike',
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
      'coopération', 'collaboration', 'durable', 'transforme',
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
  // Marques explícites de contingut pagat o fet en col·laboració. La detecció
  // es fa també sobre el summary perquè molts RSS no les posen al titular.
  /\b(sponsored|sponsor(?:ed|ship)?|paid\s+(?:post|content)|advertorial|branded\s+content|partner\s+content|in\s+partnership\s+with|produced\s+with|presented\s+by|brand\s+studio|insights\s+in\s+partnership)\b/i,
  /\b(patrocinad[oa]|contenido\s+de\s+marca|contenido\s+patrocinado|en\s+colaboraci[oó]n\s+con|producido\s+con|presentado\s+por|publicitat|contingut\s+patrocinat|contingut\s+de\s+marca|en\s+col·laboraci[oó]\s+amb|produ[iï]t\s+amb|presentat\s+per)\b/i,
  // Butlletins-resum i autopromoció de la capçalera: no són una peça
  // editorial independent encara que enllacin a notícies potencialment útils.
  /^\s*(?:the\s+download|daily\s+(?:download|digest|briefing|roundup)|morning\s+(?:roundup|briefing)|weekly\s+(?:roundup|digest)|newsletter)\s*[:—–-]?/i,
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
  // "Presenta el nou / Llança el nou..." (NOMÉS article definit: l'indefinit
  // "estrena una nova exposició/òpera/disc" és cultura de bona fe i no s'ha de tocar).
  /\b(presenta|llan[çc]a|lanza|estrena|launches|unveils|d[ée]voile|pr[eé]sente)\s+(su|el|la|its|le|la|son|sa)\s+(nuevo|nueva|new|nouveau|nouvelle|nou|nova)/i,
  // Fitxa tècnica d'automòbil venuda com a notícia (potència, consum, preu de
  // sortida): és publicitat de producte, no una bona notícia (colat el 07/07 amb
  // el Dacia Sandero: "155 CV", "4,2 L/100 Km", "consum homologat"). Aquest és el
  // senyal precís, sense tocar les estrenes culturals.
  /\b\d{2,3}\s*(cv|cavalls|caballos|ch|hp|kw)\b/i,
  /\b\d[\d.,]*\s*l\s*\/\s*100\s*km\b/i,
  /\bconsum(?:o|ption)?\s+(homologa|combina|mixt|mixto|wltp)/i,
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
  // Clickbait de bellesa, dieta i "trucs" cosmètics venut com a notícia (colat
  // el 29/06: "La celulitis se puede eliminar. Nosotros te ayudamos...").
  /\b(celulitis|cel·lulitis|estr[íi]as|estries|flacidez|flaccidesa|arrugas|arrugues|antiarrugas|antiarrugues|adelgazar|aprimar|perder peso|perdre pes|rejuvenecer|rejovenir|estr[íi]as|varices|varius)\b/i,
  /\b(nosotros\s+te\s+ayudamos|te\s+ayudamos\s+proponi|os\s+ajudem|t['’]ajudem|te\s+proponemos|et\s+proposem|trucos\s+m[áa]s\s+efectivos|trucs\s+m[ée]s\s+efectius|c[óo]mo\s+eliminar|com\s+eliminar)\b/i,
  // Sortejos, concursos i bases legals (promoció, no notícia).
  /\b(bases\s+legales|bases\s+legals|sorteo|sorteig|giveaway)\b/i,
  // Cotilleo de famosos: aniversaris, luxe i excentricitats (colat el 30/06:
  // "Así ha celebrado Kanye West su 49º cumpleaños... 400.000 dólares gastados").
  /\bsu\s+\d{1,3}\s*[ºo°]?\s*(cumpleaños|aniversari|aniversario)\b/i,
  /\b(baile\s+de\s+máscaras|alfombra\s+roja|red\s+carpet|photocall|paparazzi)\b/i,
  /\b\d[\d.,]*\s*(d[óo]lares|euros)\s+gastad[oa]s\b/i,
  // RESULTATS D'EMPRESA (colat el 27/07: "Mango factura 1.852 milions d'euros
  // en els primers sis mesos de l'any"). Una empresa que presenta comptes no és
  // una bona notícia: és informació financera, i sovint arriba com a nota de
  // premsa corporativa. El porter de positivitat no ho veia (cap paraula
  // negativa) i el model l'aprovava. Es bloca pel senyal precís —la xifra amb
  // el verb de facturació o el període comptable—, no per la paraula "empresa",
  // perquè una cooperativa que crea llocs de treball ha de poder entrar.
  // ATENCIÓ amb \b darrere una vocal accentuada: en JavaScript, "ó" no és un
  // caràcter de paraula, així que /facturaci[óo]n?\b/ NO casa amb "facturació"
  // (sí amb el castellà "facturación"). Per això aquí es tanca amb un
  // "no vingui cap més lletra" en lloc de \b.
  /\b(factur(a|à|ó|aron|en)|ingress(a|à|en)|ingres(a|ó|an))(?![a-zà-ÿ])[^.]{0,40}\b\d[\d.,]*\s*(mil|milers|miles|milions|millones|million|bilions)\b/i,
  /\b(facturaci[óo]n?|xifra\s+de\s+negoci|cifra\s+de\s+negocio|volum\s+de\s+negoci|ebitda)(?![a-zà-ÿ])/i,
  /\b(benefici|beneficio|guanys|ganancias)\s+(net|neto|nets|netos)\b/i,
  /\bresultad(os|es)?\s+(del\s+)?(primer|segon|segundo|tercer|cuarto|quart)\s+(trimestre|semestre)\b/i,
  /\bresultats\s+(semestrals|anuals|del\s+(primer|segon|tercer|quart)\s+(trimestre|semestre))\b/i,
  // Autopromoció de marca: "a través del seu programa X", "el seu nou servei X".
  /\ba\s+trav[ée]s\s+(del|de)\s+(el\s+)?(seu|su|seus|sus)\s+(programa|servei|servicio|pla|plan|projecte|proyecto)\b/i,
  // AUTOBOMBO INSTITUCIONAL (colat el 27/07: "GBSB Global consolida un model
  // educatiu pioner per formar els professionals que exigeix la nova economia").
  // És el gènere de la nota de premsa que no anuncia cap fet: una organització
  // es proclama referent, pionera o líder. Es bloca la COL·LOCACIÓ sencera
  // —verb de posicionament + superlatiu de màrqueting—, no els verbs sols:
  // "un institut lidera un projecte europeu" o "el barri consolida la seva
  // xarxa de suport" són notícies i han de continuar entrant.
  /\b(?:es|se)?\s*(?:consolida|posiciona|situa|erigeix|reafirma)\s+com[oa]?\s+(?:a\s+)?(?:un[ae]?\s+|el\s+|la\s+)?(?:referent|referente|l[íi]der|leader|pioner|pionero)(?![a-zà-ÿ])/i,
  /\b(?:consolida|refor[çc]a|refuerza|impulsa|desplega|despliega)\s+(?:un|una|el|la)(?:\s+[\wÀ-ÿ·'’-]+){0,3}\s+(?:pioner|pionera|pioners|pioneres|pionero|innovador|innovadora|capdavanter|capdavantera|de\s+refer[èe]ncia|d[e'’]\s*[èe]xit)(?![a-zà-ÿ])/i,
  /\blider(?:a|ant|ando)?\s+(?:la\s+)?(?:innovaci[óo]|transformaci[óo]|digitalitzaci[óo]|digitalizaci[óo]|sostenibilitat|sostenibilidad|excel·l[èe]ncia|excelencia)(?![a-zà-ÿ])/i,
  /\b(?:aposta\s+per|apuesta\s+por)\s+(?:la\s+)?(?:innovaci[óo]|excel·l[èe]ncia|excelencia|transformaci[óo]\s+digital)(?![a-zà-ÿ])/i,
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

function cleanEuropePmcText(value) {
  return decodeHtmlEntities(stripHtml(String(value || '')))
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractEuropePmcTag(block, tag) {
  return cleanEuropePmcText(extractTag(block, tag))
}

function normalizeEuropePmcItem(block, feed) {
  const pmcid = extractEuropePmcTag(block, 'pmcid')
  const title = extractEuropePmcTag(block, 'title')
  const publishedAt = parseRfc822Date(extractEuropePmcTag(block, 'firstPublicationDate'))
  const license = extractEuropePmcTag(block, 'license').toLowerCase()
  const abstract = extractEuropePmcTag(block, 'abstractText')
  const authors = extractEuropePmcTag(block, 'authorString')
  const journal =
    extractEuropePmcTag(block, 'journalTitle') ||
    extractEuropePmcTag(extractTag(block, 'journal'), 'title')
  const doi = extractEuropePmcTag(block, 'doi')
  const pubTypes = [...String(block || '').matchAll(/<pubType\b[^>]*>([\s\S]*?)<\/pubType>/gi)]
    .map((item) => cleanEuropePmcText(item[1]).toLowerCase())
  const isPeerReviewedStudy =
    pubTypes.includes('journal article') && !pubTypes.every((type) => type === 'review')
  // La paraula "longevity" també s'utilitza en materials, odontologia o fauna.
  // Aquesta font ha d'alimentar exclusivament la línia d'envelliment saludable
  // en persones, no qualsevol estudi que contingui el mot al títol.
  const longevityMaterial = `${title} ${abstract}`.toLowerCase()
  const hasHumanLongevityScope =
    /<descriptorName>Humans<\/descriptorName>/i.test(String(block || '')) &&
    /\b(?:centenarian|older adults?|healthy aging|healthy ageing|healthspan|age-related)\b/i.test(longevityMaterial)
  const makesTherapeuticClaim =
    /\b(?:therapeutic|treatment|small[- ]molecule|drug|inhibitor|clinical trial)\b/i.test(longevityMaterial)
  if (
    !pmcid ||
    !title ||
    !publishedAt ||
    license !== 'cc by' ||
    !isPeerReviewedStudy ||
    !hasHumanLongevityScope ||
    makesTherapeuticClaim
  ) {
    return null
  }

  const url = `https://europepmc.org/articles/${pmcid}`
  const summary = abstract || title
  if (looksLikeAdvertorial({ url, title, summary })) return null
  return {
    title,
    category: feed.defaultCategory,
    location: '',
    summary: `${summary.slice(0, 180)}${summary.length > 180 ? '...' : ''}`,
    sourceContext: [
      journal && `Revista: ${journal}.`,
      authors && `Autoria: ${authors}.`,
      doi && `DOI: ${doi}.`,
      abstract,
    ].filter(Boolean).join(' '),
    impact: 'Estudi revisat per parells d’accés obert, pendent de revisió editorial.',
    source: feed.name,
    circuit: feed.circuit || 'A',
    sourceCircuit: feed.circuit || 'A',
    sourceTopic: feed.sourceTopic || '',
    reuseLicense: feed.reuseLicense,
    sourceCredit: `${authors || feed.sourceCredit || feed.name} / ${journal || feed.name}`,
    originalUrl: doi ? `https://doi.org/${doi}` : url,
    sourceTier: feed.sourceTier || 'A',
    editorialFormat: 'constructive',
    language: feed.language,
    outputLanguage: feed.outputLanguage || 'ca',
    url,
    imageUrl: storyImagePath(url, { title, category: feed.defaultCategory }),
    imageAlt: `Il·lustració editorial per a ${title}.`,
    imageCredit: 'El Bon Diari (il·lustració IA)',
    imageAttributionUrl: '',
    editorialScore: 0,
    curated: false,
    editorialVersion: liveEditorialVersion,
    publishedAt,
    study: {
      journal,
      doi,
      peerReviewed: true,
      openAccessLicense: 'CC BY',
      pmcUrl: url,
    },
  }
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
    // Alguns mitjans deixen al titular el marcador d'objecte incrustat (U+FFFC,
    // on hi havia una foto o un vídeo) o el símbol de caràcter il·legible
    // (U+FFFD). Arribaven tal qual a la portada com un requadre buit.
    .replace(/[\uFFF9-\uFFFD]/g, ' ')
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

  const category = refineCategoryByContent(section.category, title, description)
  return {
    title,
    category,
    location: detectLocation(fullText.toLowerCase()),
    summary: summarySnippet,
    sourceContext: description.slice(0, 1400),
    impact:
      'El radar automàtic l’ha detectada com a notícia constructiva de proximitat.',
    source: '3CatInfo',
    language: 'ca',
    url: link,
    // Igual que a la resta del radar: la imatge del mitjà només filtra qualitat;
    // publiquem una il·lustració editorial pròpia (cap foto de tercers).
    imageUrl: storyImagePath(link, { title, category }),
    imageAlt: `Il·lustració editorial per a ${title}.`,
    imageCredit: 'El Bon Diari (il·lustració IA)',
    imageAttributionUrl: '',
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

function buildSourceContext(...values) {
  const unique = []
  const seen = new Set()
  for (const value of values) {
    const clean = decodeHtmlEntities(stripHtml(value))
    const key = clean.toLocaleLowerCase()
    if (!clean || seen.has(key)) continue
    seen.add(key)
    unique.push(clean)
  }
  return unique.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1400)
}

// Marcadors de contingut POLÍTIC tens (partits, procés electoral o parlamentari,
// judicial). No bloquegen la notícia —de tant en tant hi ha política bona— però
// li treuen el passi lliure: haurà de passar per la IA per sortir, en lloc de
// colar-se per una paraula positiva incidental. S'eviten mots ambigus com "junts"
// (=plegats) o "sumar" (=afegir); s'usen formes inequívoques.
export const POLITICAL_MARKERS = new RegExp(
  [
    'psoe', '\\bvox\\b', '\\berc\\b', 'podemos', 'bildu', '\\bpnv\\b', 'ciudadanos',
    'alian[çc]a catalana', 'partit popular', 'partido popular', 'prim[àa]ries',
    'primarias', 'investidura', 'moci[óo] de censura', 'esmena', 'enmienda',
    'escaño', 'bancada', 'electoral', 'eleccion', 'elecci[óo]ns', 'urnes',
    'portaveu del', 'portavoz del', 'posconvergent', 'retret',
    'reproche', 'dimissi', 'dimisi[óo]n', 'destituci', 'cessament',
    // Maniobra de partit per esquivar responsabilitats (traspàs de culpes entre
    // càrrecs): no és bona notícia (colat el 07/07 amb "Cabezas DESVINCULA
    // Argimon del retard en la vacunació…").
    'desvincula', 'desmarca', 'carrega les culpes', 'carga las culpas',
    'traspassa la culpa', 'traspasa la culpa',
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
export const UNIVERSAL_NEG = new RegExp(
  [
    // Calor extrema / desastre climàtic (ca/es/it/fr/pt/en).
    'onada de calor', 'ola de calor', 'onda de calor', 'ondata di calore',
    'vague de chaleur', 'heatwave', 'heat wave', 'calor extrem', 'calor extremo',
    'calor h[úu]m[ei]do', 'caldo record', 'caldo torrido', 'morsa del caldo',
    'd[íi][ae]s de calor', 'calor perill', 'calor peligros',
    'hottest day', 'jour le plus chaud', 'dia mais quente', 'devido ao calor',
    'cop de calor', 'golpe de calor', 'colpo di calore', 'dies de calor',
    'r[èe]cord de calor', '\\b(?:3[5-9]|4\\d)\\s*(?:graus|grados|degrees|°\\s*c)',
    // Incendis i focs actius, també quan una font local usa només "foc".
    '\\bfoc\\b', '\\bfire\\b', 'wildfire', 'incendi', 'incendio', 'incendie',
    // Addicció a les pantalles / mòbil.
    'enganchados al m[óo]vil', 'enganxats al m[òo]bil', 'adicci[óo]n al m[óo]vil',
    'addicci[óo] al m[òo]bil', 'phone addiction', 'dipendenza da smartphone',
    'adicci[óo]n a las pantallas',
    // Conflicte, guerra i geopolítica tensa (el model petit ho aprova massa):
    'netanyahu', 'cisjord[àa]nia', 'cisjordania', 'west bank',
    'israel', '\\bgaza\\b', '\\bhamas\\b', 'hezbol', 'taliban', 'l[íi]bano',
    'l[íi]ban\\b', 'ucra[ïi]na', 'ucrania', 'ukraine', '\\bputin\\b', 'kremlin',
    // Trump com a marcador de política de conflicte/favoritisme: a un radar de
    // bones notícies gairebé sempre és soroll (colat el 07/07 amb "L'annulation
    // du carton rouge de Balogun est-elle un cadeau d'Infantino à Trump ?").
    '\\btrump\\b',
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
    'n[àáa]ufrag',
    'migrant boat', 'small boat', 'channel crossing',
    'migraci[óo]n irregular', 'immigraci[óo] irregular', 'imigra[çc][ãa]o ilegal',
    'sin papeles', 'sense papers', 'salto a la valla', 'salt a la tanca',
    // Mercats i especulació borsària: un rècord de mercat (Nasdaq, IBEX, volum
    // de negociació…) no és una bona notícia per a tothom (cas Nasdaq, 2/07).
    'nasdaq', 'wall street', '\\bibex\\b', 'dow jones', '\\bnikkei\\b',
    'cotizaci[óo]n', 'cotitzaci[óo]', 'bolsa de valores', 'borsa de valors',
    'mercado burs[áa]til', 'mercat borsari', 'volumen de negociaci',
    'volum de negociaci', 'm[áa]xim[oa]s? hist[óo]ric[oa]s? en bolsa',
    // Tertúlia, realities i premsa del cor (safareig, no és notícia
    // constructiva; cas "'El sótano club', de Alba Carrillo").
    'prensa rosa', 'premsa rosa', 'prensa del coraz[óo]n', 'reality show',
    'gran hermano', 's[áa]lvame\\b', 'tertuli', 'famoseo', 'concursant',
    's[óo]tano club',
  ].join('|'),
  'i',
)

// EXCEPCIÓ DE RESCAT (decisió editorial del 27-07-2026).
//
// El bloc dur descarta la immigració marítima perquè l'arribada d'una pastera
// és contingut de crisi, no una bona notícia. Però la feina d'Open Arms, de
// Salvament Marítim o de la Creu Roja és exactament això, i el diari vol cobrir
// la gent que treballa pels altres. Sense excepció, el resultat era incoherent:
// "Open Arms rescata 200 persones al Mediterrani" entrava i "Open Arms rescata
// un cayuco amb 200 persones" no, segons com ho escrivís el mitjà.
//
// L'excepció és ESTRETA a propòsit. Només s'aplica si es compleix tot:
//   1) el motiu del bloqueig és NOMÉS la part marítima (es comprova emmascarant
//      aquests termes i tornant a passar el bloc dur sencer: així una peça que
//      també parli d'onada de calor o de guerra segueix caient);
//   2) hi ha algú rescatant, no només gent arribant;
//   3) no hi ha morts. Un rescat amb víctimes no és una bona notícia.
const MARITIME_TERMS =
  'pastera|pasteres|patera|pateras|cayuco|cayucos|naufrag|n[àáa]ufrag|migrant boat|small boat|channel crossing'
const MARITIME_MIGRATION = new RegExp(MARITIME_TERMS, 'i')
const MARITIME_MIGRATION_GLOBAL = new RegExp(MARITIME_TERMS, 'gi')

const RESCUE_MARKERS =
  /\b(rescat|rescata|rescaten|rescatad|rescatat|rescatats|rescatades|salvament|salvamento|socorr|auxilia|posa fora de perill|pone a salvo|rescue|rescued|rescuers|coast ?guard|open arms|salvament mar[íi]tim|salvamento mar[íi]timo|creu roja|cruz roja|red cross)/i

const DEATH_MARKERS =
  /\b(mort|morts|muert|fallecid|difunt|cad[àa]ver|cad[áa]ver|v[íi]ctimes mortals|v[íi]ctimas mortales|ofegat|ofegats|ofegada|ahogad|desapareguts|desaparecidos|dead|bodies|drowned|cossos(?! de seguretat)|cuerpos(?! de seguridad)|sense vida|sin vida)/i

export function isMaritimeRescue(text, language = 'ca') {
  const t = String(text || '').toLowerCase()
  if (!MARITIME_MIGRATION.test(t)) return false
  // Si, tret de la part marítima, encara hi ha un altre motiu de bloqueig, cau.
  // Es comprova contra les DUES barreres: el bloc dur multilingüe i el
  // diccionari negatiu de la llengua (que també conté pastera i naufragi).
  const masked = t.replace(MARITIME_MIGRATION_GLOBAL, ' embarcacio ')
  if (UNIVERSAL_NEG.test(masked)) return false
  if (passesEditorialFilter(masked, language).isNegative) return false
  return RESCUE_MARKERS.test(t) && !DEATH_MARKERS.test(t)
}

export function normalizeFeedItem(block, feed) {
  if (feed?.format === 'europe-pmc-search') {
    return normalizeEuropePmcItem(block, feed)
  }
  const title = decodeHtmlEntities(stripHtml(extractTag(block, 'title')))
  const linkTag = extractTag(block, 'link')
  const link = decodeHtmlEntities(linkTag || extractAtomLink(block))
  const descriptionHtml =
    extractTag(block, 'description') ||
    extractTag(block, 'summary') ||
    extractTag(block, 'content')
  const contentEncodedHtml = extractTag(block, 'content:encoded')
  const description = decodeHtmlEntities(stripHtml(descriptionHtml))
  const contentEncoded = decodeHtmlEntities(stripHtml(contentEncodedHtml))
  const subtitle = decodeHtmlEntities(stripHtml(extractTag(block, 'subtitle')))
  const publishedAt =
    parseRfc822Date(extractTag(block, 'pubDate')) ||
    parseRfc822Date(extractTag(block, 'published')) ||
    parseRfc822Date(extractTag(block, 'updated'))
  // Cal descodificar les entitats HTML de la URL de la imatge: molts feeds
  // (The Guardian, entre d'altres) escriuen els ampersands com a "&amp;", cosa
  // que trenca el paràmetre de signatura "s=" de la URL i fa que la imatge
  // torni un 401. Sense això, la peça entrava amb una imatge que no carregava i
  // el front hi posava el degradat genèric (perdent la foto real de la font).
  const imageUrl = decodeHtmlEntities(pickImageForItem(block))
  // Per als feeds dedicats a una secció (forceCategory) confiem en la secció
  // del feed, no en l'etiqueta de l'article (que sovint la desvia a Espanya,
  // Salut…). Així Cultura/Tecnologia/Ciència s'omplen de debò.
  const rawCategory = feed.forceCategory
    ? feed.defaultCategory
    : extractPrimaryCategory(block, feed.defaultCategory)

  if (!title || !link || !publishedAt || !imageUrl) return null

  const summarySource = subtitle || description || contentEncoded || title
  const sourceContext = buildSourceContext(
    subtitle,
    descriptionHtml,
    contentEncodedHtml,
  )
  const summarySnippet = `${summarySource.slice(0, 180)}${summarySource.length > 180 ? '...' : ''}`
  // Correcció per contingut: si el títol/resum tenen un senyal temàtic clar,
  // sobreescrivim la categoria heretada del feed (evita, p. ex., que un tema de
  // TV etiquetat com a Esports o una exposició de fotografia surtin mal ubicats).
  const editorialFormat = feed.editorialMode || 'constructive'
  const isTrustedService = editorialFormat !== 'constructive'
  const category = isTrustedService
    ? rawCategory
    : refineCategoryByContent(rawCategory, title, summarySource)
  if (looksLikeAdvertorial({ url: link, title, summary: summarySnippet })) return null
  const fullText = `${title} ${summarySource}`
  const fullTextLower = fullText.toLowerCase()
  let isPositive = false
  if (!isTrustedService) {
    const editorialResult = passesEditorialFilter(fullText, feed.language)
    isPositive = editorialResult.isPositive
    // L'excepció de rescat val per a les DUES barreres: tant el diccionari
    // negatiu de la llengua com el bloc dur contenen "pastera" i "naufragi".
    const esRescatMaritim = isMaritimeRescue(fullTextLower, feed.language)
    if (editorialResult.isNegative && !esRescatMaritim) return null
    // Bloc dur universal (multilingüe) per a categories que el model petit
    // deixa passar. No s'aplica als formats de verificació: el titular ha de
    // poder citar precisament el rumor, conflicte o engany que desmenteix.
    // L'excepció de rescat deixa passar la feina de qui salva gent al mar; la
    // simple arribada d'una pastera segueix caient. Vegeu isMaritimeRescue.
    if (UNIVERSAL_NEG.test(fullTextLower) && !esRescatMaritim) return null

    // Contingut POLÍTIC tens: gairebé mai és una bona notícia. Els formats de
    // verificació en queden exempts perquè comprovar el discurs polític és la
    // seva funció editorial.
    const isPolitical =
      !feed.lenient &&
      (category === 'Política' || POLITICAL_MARKERS.test(fullTextLower))
    if (isPolitical) return null
  }
  const editorialScore = isTrustedService || isPositive || feed.lenient ? 1 : 0
  const impactByFormat = {
    verification:
      'Aporta una comprovació documentada per separar els fets del soroll.',
    agenda:
      'Ofereix una activitat concreta que el lector pot aprofitar.',
    opportunity:
      'Converteix informació pública en una oportunitat accionable.',
  }

  const useLicensedSourceImage =
    feed.circuit === 'A' && imageUrl && feed.imageRights && feed.licenseProofUrl
  const imageRights = useLicensedSourceImage
    ? {
        verified: true,
        license: feed.imageRights.license,
        proofUrl: feed.licenseProofUrl,
        policy: 'institution-published-whole-image',
      }
    : undefined
  const story = {
    title,
    category,
    location: detectLocation(fullText.toLowerCase()),
    summary: summarySnippet,
    sourceContext,
    impact:
      impactByFormat[editorialFormat] ||
      'El radar automàtic l’ha detectada com a notícia constructiva.',
    source: feed.name,
    circuit: feed.circuit || 'B',
    sourceCircuit: feed.circuit || 'B',
    sourceTopic: feed.sourceTopic || '',
    reuseLicense: feed.reuseLicense || '',
    sourceCredit: feed.sourceCredit || feed.name,
    originalUrl: link,
    sourceTier: feed.sourceTier || 'B',
    editorialFormat,
    language: feed.language,
    outputLanguage: feed.outputLanguage || feed.language,
    url: link,
    imageUrl: useLicensedSourceImage ? imageUrl : storyImagePath(link, { title, category }),
    imageAlt: useLicensedSourceImage
      ? `Imatge publicada per ${feed.sourceCredit || feed.name}: ${title}`
      : `Il·lustració editorial per a ${title}.`,
    imageCredit: useLicensedSourceImage
      ? `${feed.imageRights.credit || feed.name} · ${feed.imageRights.license}`
      : 'El Bon Diari (il·lustració IA)',
    imageAttributionUrl: useLicensedSourceImage ? link : '',
    ...(imageRights ? { imageRights } : {}),
    // editorialScore calculat a dalt: 0 = neutre/polític (només surt si la IA
    // l'aprova) · 1 = bo (paraula clau positiva o feed local).
    editorialScore,
    // Una font constructiva curada o un canal de servei de confiança no torna
    // a passar pel porter de positivitat. Manté, igualment, el crèdit i
    // l'enllaç a l'original.
    curated: Boolean(feed.curated || isTrustedService),
    editorialVersion: liveEditorialVersion,
    publishedAt,
  }
  // Verificacions i agenda també necessiten una reescriptura específica: la
  // plantilla genèrica antiga produïa quatre cossos idèntics a portada.
  if (editorialFormat === 'opportunity' || editorialFormat === 'data') {
    const ownSummaryByFormat = {
      opportunity:
        `${feed.name} recull aquesta convocatòria i n’ofereix la informació oficial.`,
      data:
        `${feed.name} ha actualitzat aquest indicador públic.`,
    }
    story.summary =
      ownSummaryByFormat[editorialFormat] ||
      `${feed.name} ha publicat aquesta informació de servei.`
    story.body = [
      story.summary,
      `${story.impact} Consulta la font original per veure’n totes les dades i el context.`,
    ]
    story.ownContent = true
  }
  // No la llencem (les clarament negatives ja han caigut amunt). La IA revisarà
  // totes les candidates: vetarà les dolentes que han colat per paraula clau i
  // rescatarà les bones neutres (p. ex. un producte nou amb aplicacions positives).
  // editorialScore: 1 = ha passat per paraula clau · 0 = neutra.
  return story
}

export const FEED_HEALTH_KV_KEY = 'feed-health-stats'
const CIRCUIT_BREAKER_MAX_FAILURES = 5
const CIRCUIT_BREAKER_PAUSE_MS = 24 * 60 * 60 * 1000 // 24 hores
const BROWSER_FEED_HEADERS = {
  accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  'accept-language': 'ca-ES,ca;q=0.9,en;q=0.8',
  // Alguns gestors de bot bloquegen clients que només s'identifiquen amb un
  // nom de producte. El mateix perfil s'aplica a TOT el pipeline de feeds.
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 ElBonDiari/1.0 (+https://bondiari.com)',
}

function retryableFeedStatus(status) {
  return status === 408 || status === 429 || status >= 500
}

function waitForFeedRetry(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

export async function readFeedHealthStats(kvOrEnv) {
  const kv = kvOrEnv?.LIVE_NEWS_KV || kvOrEnv
  if (!kv || typeof kv.get !== 'function') return {}
  try {
    const data = await kv.get(FEED_HEALTH_KV_KEY, 'json')
    return data && typeof data === 'object' ? data : {}
  } catch (error) {
    console.warn('[feed-health] no s’ha pogut llegir KV', error?.message)
    return { _readError: true }
  }
}

export async function saveFeedHealthStats(kvOrEnv, stats) {
  const kv = kvOrEnv?.LIVE_NEWS_KV || kvOrEnv
  if (!kv || typeof kv.put !== 'function' || !stats) return
  if (stats._readError) {
    console.warn('[feed-health] s’evita sobreescriure KV per error de lectura previ')
    return
  }
  const cleanStats = { ...stats }
  delete cleanStats._readError
  try {
    await kv.put(FEED_HEALTH_KV_KEY, JSON.stringify(cleanStats))
  } catch (error) {
    console.warn('[feed-health] no s’han pogut desar les mètriques', error?.message)
  }
}

export function isFeedPaused(feedHealthRecord, now = Date.now()) {
  if (!feedHealthRecord || !feedHealthRecord.pausedUntil) return false
  const pauseEnd = new Date(feedHealthRecord.pausedUntil).getTime()
  return !isNaN(pauseEnd) && pauseEnd > now
}

export function isSignificantHealthChange(oldRecord, newRecord) {
  if (!newRecord) return false
  if (!oldRecord) {
    return newRecord.status !== 'ok' || (newRecord.consecutiveFailures || 0) > 0
  }
  if (oldRecord.status !== newRecord.status) return true
  if ((oldRecord.consecutiveFailures || 0) !== (newRecord.consecutiveFailures || 0)) return true
  if (oldRecord.pausedUntil !== newRecord.pausedUntil) return true
  return false
}

export async function fetchFeed(feed, options = {}) {
  const timeoutMs = options.timeoutMs ?? feed.fetch?.timeoutMs ?? 6000
  const maxAttempts = options.maxAttempts ?? feed.fetch?.maxAttempts ?? 1
  const retryDelayMs = options.retryDelayMs ?? feed.fetch?.retryDelayMs ?? 250
  const startTime = Date.now()
  let lastResult = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(feed.url, {
        headers: BROWSER_FEED_HEADERS,
        signal: controller.signal,
      })

      if (!response.ok) {
        lastResult = {
          ok: false,
          status: response.status,
          xml: null,
          error: `HTTP ${response.status}`,
          durationMs: Date.now() - startTime,
          attempts: attempt,
        }
        if (!retryableFeedStatus(response.status)) return lastResult
      } else {
        const xml = await response.text()
        if (!isValidConfiguredFeedXml(feed, xml)) {
          return {
            ok: false,
            status: response.status,
            xml,
            error: 'Not valid RSS/Atom XML',
            durationMs: Date.now() - startTime,
            attempts: attempt,
          }
        }
        return {
          ok: true,
          status: response.status,
          xml,
          error: null,
          durationMs: Date.now() - startTime,
          attempts: attempt,
        }
      }
    } catch (error) {
      const isAbort = error.name === 'AbortError' || controller.signal?.aborted
      lastResult = {
        ok: false,
        status: 0,
        xml: null,
        error: isAbort ? `Timeout (${timeoutMs}ms)` : (error?.message || 'Fetch error'),
        durationMs: Date.now() - startTime,
        attempts: attempt,
      }
    } finally {
      clearTimeout(timeoutId)
    }
    if (attempt < maxAttempts) await waitForFeedRetry(retryDelayMs)
  }
  return lastResult
}

export async function collectFeedStories(feed, options = {}) {
  const now = options.now ?? Date.now()
  const healthRecord = options.healthRecord || null

  if (isFeedPaused(healthRecord, now)) {
    console.warn(`[radar] Feed ${feed.name} pausat per circuit breaker (fins ${healthRecord.pausedUntil})`)
    return { stories: [], candidates: 0, skipped: true, healthUpdate: healthRecord }
  }

  const result = await fetchFeed(feed, options)
  const isoNow = new Date(now).toISOString()

  if (!result.ok) {
    console.warn(`[radar] Ha fallat el feed ${feed.name}: ${result.error}`)
    const prevFailures = healthRecord?.consecutiveFailures || 0
    const newFailures = prevFailures + 1
    const pausedUntil =
      newFailures >= CIRCUIT_BREAKER_MAX_FAILURES
        ? new Date(now + CIRCUIT_BREAKER_PAUSE_MS).toISOString()
        : null

    const healthUpdate = {
      name: feed.name,
      url: feed.url,
      lastAttemptAt: isoNow,
      lastSuccessAt: healthRecord?.lastSuccessAt || null,
      lastHttpStatus: result.status,
      durationMs: result.durationMs,
      storiesCount: 0,
      rawItemCount: 0,
      consecutiveFailures: newFailures,
      status: 'error',
      pausedUntil,
      lastError: result.error,
    }
    return { stories: [], candidates: 0, healthUpdate }
  }

  const activation = validateFeedActivation(feed, result.xml, now)
  if (!activation.active) {
    const healthUpdate = {
      name: feed.name,
      url: feed.url,
      lastAttemptAt: isoNow,
      lastSuccessAt: healthRecord?.lastSuccessAt || null,
      lastHttpStatus: result.status,
      durationMs: result.durationMs,
      storiesCount: 0,
      rawItemCount: activation.entries.length,
      consecutiveFailures: 0,
      status: 'disabled',
      pausedUntil: null,
      lastError: `activació desactivada: ${activation.reason}`,
    }
    console.warn(`[radar] Feed ${feed.name} desactivat: ${activation.reason}`)
    return { stories: [], candidates: 0, disabled: true, healthUpdate }
  }

  const itemRegex = feed.format === 'europe-pmc-search'
    ? /<result\b[^>]*>([\s\S]*?)<\/result>/gi
    : /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi
  const stories = []
  let candidates = 0
  let match
  while ((match = itemRegex.exec(result.xml)) !== null) {
    candidates += 1
    const block = feed.format === 'europe-pmc-search' ? match[1] : match[2]
    const story = normalizeFeedItem(block, feed)
    if (story) stories.push(story)
  }

  const isEmpty = candidates === 0
  const healthUpdate = {
    name: feed.name,
    url: feed.url,
    lastAttemptAt: isoNow,
    lastSuccessAt: isoNow,
    lastHttpStatus: result.status,
    durationMs: result.durationMs,
    storiesCount: stories.length,
    rawItemCount: candidates,
    consecutiveFailures: 0,
    status: isEmpty ? 'empty' : 'ok',
    pausedUntil: null,
    lastError: isEmpty ? 'RSS sense ítems' : null,
  }

  return { stories, candidates, healthUpdate }
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
// El model de text el tria ara ./ai/textModel.js (Gemini o Cloudflare).
const aiVerdictsKey = 'ai-verdicts-v3' // un sol registre KV amb TOTS els veredictes
const aiVerdictTtlMs = 14 * 24 * 60 * 60 * 1000 // 14 dies
// La IA jutja en LOTS: moltes notícies en una sola crida. Així, amb poques
// subpeticions (límit del pla gratuït), arriba a revisar-ne ~aiBatchSize ×
// maxAiCallsPerRun per passada i passa a ser el PORTER de debò, en lloc de
// revisar-ne només 10 i deixar passar la resta per paraula clau.
const aiBatchSize = 10
const maxAiCallsPerRun = 6 // 6×10 = 60 jutjades/passada; 24 feeds + 6 = 30 subpeticions

const AI_SYSTEM_BATCH = [
  "Ets el filtre d'El Bon Diari, un diari especialitzat en català que NOMÉS",
  'publica peces de vuit àmbits: Ciència, Tecnologia, IA, Biotecnologia,',
  'Astronomia, Longevitat, Filosofia i Literatura.',
  'Et passo una llista numerada de titulars. Per a CADA número respon en una',
  'línia amb el format "N: SI" o "N: NO" (només això, res més).',
  // TROBALLA, NO PROCÉS (13-08-2026). Les dues primeres peces que va revisar
  // una persona es van descartar per avorrides, i totes dues tenien la mateixa
  // forma: "avancen les converses per iniciar un assaig" i "les empreses
  // busquen dades fiables". Cap de les dues explicava res que hagués passat.
  'Respon SI només si la peça explica una TROBALLA, un RESULTAT o una IDEA:',
  'alguna cosa que s’ha descobert, s’ha observat, s’ha demostrat, s’ha',
  'publicat en un estudi, o un pensament que es proposa i es defensa.',
  'Respon NO si només explica INTENCIONS o PROCÉS, encara que sigui d’un',
  'àmbit bo: converses, negociacions, reunions, plans, anuncis del que es',
  'farà, projectes que tot just comencen, empreses que busquen, inverteixen o',
  's’alien, finançament, contractes, tendències de mercat, informes de sector',
  'o adopció de tecnologia per part d’organitzacions.',
  'Respon NO si el titular és dolent, trist o tens: guerra, mort, accident,',
  'succés, crim, armes, droga, judici, corrupció, escàndol, política o',
  'eleccions, conflicte, retret o insult, tensió diplomàtica o comercial,',
  'sanció, alerta sanitària o alimentària, condemna o càstig, dòping, onada de',
  'calor o desastre climàtic, crisi o caiguda econòmica, acomiadaments,',
  'retallades pressupostàries o d’ajuts, tancament de programes o serveis,',
  'pujada de preus, taxes o impostos, un projecte o servei bo que es cancel·la,',
  'immigració irregular, pasteres, naufragis o rescats al mar,',
  'cotilleos o vida privada de famosos, luxe i excentricitats de rics,',
  'sortejos o bases legals de concursos, o',
  'resultats i fitxatges de competició esportiva.',
  'Respon NO si no pertany clarament a un dels vuit àmbits autoritzats.',
  'Dit curt: respon SI només si, després de llegir el titular, el lector sap',
  'alguna cosa NOVA que abans no sabia. Si només sap què pensa fer algú,',
  'respon NO.',
  'En cas de DUBTE, respon NO.',
  'Exemple:\n1: NO\n2: SI\n3: NO',
].join(' ')

// Jutja un lot de notícies en una sola crida. Retorna un array de true/false/
// null (null = el model no ha donat veredicte clar per a aquell número).
async function aiJudgeBatch(env, stories) {
  const list = stories
    .map((s, i) => {
      const context = `${s.category || ''} | ${s.title || ''} | ${s.summary || ''}`
        .replace(/\s+/g, ' ')
        .slice(0, 260)
      return `${i + 1}. ${context}`
    })
    .join('\n')
  const out = await runTextModel(env, {
    system: AI_SYSTEM_BATCH,
    user: `Titulars:\n${list}`,
    maxTokens: 256,
  })
  const text = String(out?.response || '')
  const verdicts = new Array(stories.length).fill(null)
  for (const m of text.matchAll(/(\d{1,2})\s*[-:.)]?\s*(S[IÍ]|NO|YES)\b/gi)) {
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
async function aiReview(env, candidates, { failOpen = true } = {}) {
  if (!env?.AI) {
    return failOpen
      ? candidates.filter((story) => (story.editorialScore ?? 1) > 0)
      : candidates.filter((story) => story.curated)
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
    // Només les fonts dedicades íntegrament a bones notícies es consideren ja
    // curades. El contingut local també passa el judici: proximitat no equival a
    // positivitat i abans hi entraven incendis, calor extrema i successos.
    if (story.curated) {
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
        verdict.set(
          story.url,
          failOpen && (story.editorialScore ?? 1) > 0,
        )
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
    verdict.set(
      story.url,
      failOpen && (story.editorialScore ?? 1) > 0,
    )
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

function sourceMaterialScore(story) {
  const contextWords = String(story?.sourceContext || '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length
  const tierScore = story?.sourceTier === 'A' ? 3 : story?.sourceTier === 'B' ? 2 : 1
  const localScore = story?.location && story.location !== 'Món' ? 2 : 0
  return tierScore + localScore + Math.min(5, Math.floor(contextWords / 40))
}

// `seenUrls`: notícies que ja s'han publicat alguna vegada (clau seen-urls, 14
// dies). S'aparten AQUÍ, abans de jutjar i abans de retallar la reserva.
//
// Abans es retallava la reserva a collectionPoolSize i només després, ja fora
// d'aquesta funció, s'apartaven les ja publicades. Com que el retall es queda
// les MILLORS i les millors són justament les que ja han sortit altres dies, de
// les 30 en quedaven tres o quatre d'aprofitables i la resta de candidates
// aprovades no arribaven a ser considerades mai. Mesurat el 27-07-2026: 225
// candidates, 121 aprovades pel jutge... i 4 peces a la portada.
//
// Apartar-les abans té un segon efecte bo: el pressupost de crides a la IA es
// gasta només en peces que de debò poden sortir.
export async function collectLivePositiveNews(env, { seenUrls } = {}) {
  const now = Date.now()
  const healthStats = await readFeedHealthStats(env)
  // Només la finestra de fonts d'aquest refresc (core + rotatòries), per no
  // petar el límit de subpeticions. La rotació avança sola amb el temps.
  const feedsThisRun = selectFeedsForRun(now)
  const [sectionResults, feedResults, serviceResults] = await Promise.all([
    Promise.all(sections.map(collectSectionStories)),
    Promise.all(
      feedsThisRun.map((feed) =>
        collectFeedStories(feed, {
          now,
          healthRecord: healthStats[feed.name],
          env,
        }),
      ),
    ),
    // LES FONTS DE SERVEI TAMBÉ S'APAGUEN AMB EL GIR (13-08-2026).
    //
    // L'agenda cultural, les oportunitats i les dades obertes van per un camí
    // a part i no passaven per l'interruptor de fonts: la primera nit del gir,
    // la portada d'un diari d'astronomia i filosofia obria amb una exposició
    // de Gaudí a Mataró, etiquetada com a Ciència.
    //
    // Són bones fonts, però d'un diari de proximitat, no d'un diari
    // especialitzat d'abast mundial. Es tornen a encendre amb la mateixa
    // constant que la resta.
    NOMES_FONTS_DEL_GIR
      ? Promise.resolve([[], [], []])
      : Promise.all([
          collectAgendaStories(),
          collectRaiscOpportunities(),
          collectIdescatUpdates(),
        ]),
  ])

  for (const result of feedResults) {
    if (result.healthUpdate) {
      healthStats[result.healthUpdate.name] = result.healthUpdate
    }
  }
  await saveFeedHealthStats(env, healthStats)

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
  for (const result of serviceResults) {
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
  const alreadyPublished = seenUrls instanceof Set ? seenUrls : new Set()
  const recents = [...uniqueStories.values()]
    // Barrera temàtica permanent: cap peça no arriba al porter de positivitat
    // si no és Cultura, Esports, Ciència, Tecnologia, Societat, Religió,
    // Solidaritat o Educació. També reclassifica etiquetes tècniques com
    // "Agenda" quan el contingut és, de fet, cultural.
    .map((story) => keepAllowedEditorialTopic(story))
    .filter(Boolean)
    .filter((story) => isStoryWithinLiveWindow(story))
    // Les que ja s'han publicat surten AQUÍ, abans de jutjar i abans de retallar
    // la reserva. Si es queden, ocupen el tall de les 30 millors i deixen fora
    // les que sí que podrien sortir. Les que ja són al lot hi continuen per
    // l'arrossegament, no per aquesta llista.
    .filter((story) => !alreadyPublished.has(story.url))
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
      return (
        sourceMaterialScore(right) - sourceMaterialScore(left) ||
        right.editorialScore - left.editorialScore ||
        timeRight - timeLeft
      )
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

// v4 permet reavaluar les URL de l'edició antiga amb els nous criteris de
// qualitat i el context de font ampliat.
const seenUrlsKey = 'seen-urls-v4'
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
  } catch {
    return { month: key.slice('editorial-stats:'.length), reviewed: 0, published: 0, lastUpdatedAt: null }
  }
}

// Seccions editorials de poc volum que abans es quedaven seques perquè les
// categories grans (Espanya, Societat…) s'enduien totes les places.
const guaranteedCategories = ALLOWED_EDITORIAL_TOPICS

const categoryLimits = {
  Cultura: 3,
  Verificació: 2,
  Agenda: 2,
  Local: 4,
}

export function capPerCategory(stories, defaultLimit = 3) {
  const counts = new Map()
  return stories.filter((story) => {
    const category = story?.category || 'Actualitat'
    const limit = categoryLimits[category] || defaultLimit
    const count = counts.get(category) || 0
    if (count >= limit) return false
    counts.set(category, count + 1)
    return true
  })
}

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

export async function getLiveNewsPayload(
  kv,
  { force = false, env, allowRefresh = true } = {},
) {
  const runStartTime = Date.now()
  let cached = null
  try {
    cached = await getCachedPayload(kv)
    sanitizeStoryPhotos(cached?.stories)
  } catch (error) {
    console.warn('No s’ha pogut llegir la memòria de notícies', error)
  }

  if (!force) {
    const updatedAt = cached?.updatedAt ? new Date(cached.updatedAt).getTime() : 0
    const isFresh = updatedAt && Date.now() - updatedAt < refreshIntervalMs
    const usesCurrentEditorialVersion =
      cached?.stories?.length > 0 &&
      cached.stories.every(
        (story) => story.editorialVersion === liveEditorialVersion,
      )
    if (cached?.stories && isFresh && usesCurrentEditorialVersion) {
      return { ...cached, cache: 'hit' }
    }

    // La ruta pública només ha de llegir. Recollir desenes de fonts, passar-les
    // per IA i escriure KV és feina del cron, la cua o l'endpoint manual. Si la
    // caché és vella la servim igualment; si encara no n'hi ha, responem buit en
    // lloc de deixar el visitant esperant una regeneració llarga.
    if (!allowRefresh) {
      if (cached?.stories) {
        return { ...cached, cache: 'stale-readonly' }
      }
      return {
        updatedAt: null,
        nextRefreshAt: null,
        stories: [],
        cache: 'miss-readonly',
      }
    }
  }

  // Les ja publicades es llegeixen ABANS de recollir, perquè la recollida les
  // pugui apartar abans de retallar la reserva (vegeu collectLivePositiveNews).
  const seenEntries = await loadSeenEntries(kv)
  const seenSet = new Set(seenEntries.map((entry) => entry.url))
  const { stories: allStories, reviewed: reviewedThisPass } =
    await collectLivePositiveNews(env, { seenUrls: seenSet })
  // La recollida ja no en torna cap de publicada; el filtre es manté com a
  // xarxa de seguretat i per marcar-les com a fresques.
  const freshStories = allStories
    .filter((story) => !seenSet.has(story.url))
    .map((story) => ({ ...story, isFresh: true }))
  const freshUrlSet = new Set(freshStories.map((story) => story.url))

  // CAP FONT NO HA RESPOST (avaria) → mantenir el lot tal com estava.
  //
  // La condició mira reviewedThisPass, no allStories. Ara que les ja publicades
  // s'aparten a la recollida, és normal i sa que una passada no porti res nou:
  // vol dir que encara no s'ha publicat res que no tinguem. En aquest cas s'ha
  // de CONTINUAR, perquè l'arrossegament és qui poda les peces que passen dels
  // cinc dies. Sortint per aquí, el lot es quedaria congelat i les velles no
  // marxarien mai.
  if (reviewedThisPass === 0 && cached?.stories?.length) {
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
    .filter((s) => isStoryWithinLiveWindow(s))
    .filter((s) => keepsEditorialClearance(s, liveEditorialVersion))
    // Descartem l'arrossegament de fonts que ja no són a la llista (p. ex. mitjans
    // de pagament retirats): així desapareixen a la primera, sense esperar 4 dies.
    .filter((s) => allowedSourceNames.has(s.source))
    // El mateix filtre s'aplica a les peces arrossegades d'edicions anteriors:
    // desplegar una regla nova no les deixa visibles fins que caduquin.
    .map((story) => keepAllowedEditorialTopic(story))
    .filter(Boolean)
    .map(({ isFresh: _isFresh, ...rest }) => ({
      ...rest,
      editorialVersion: liveEditorialVersion,
    }))
  const preDiversity = [...freshStories, ...carryover]
  // Acotem les llengües foranes ABANS de la diversitat per font, perquè el
  // català i el castellà mai no quedin fora encara que un dia hi hagi allau de
  // notícies europees.
  const languageBalanced = capPerLanguage(preDiversity, maxStoriesPerLanguage)
  const balanced = capPerCategory(languageBalanced)
  const finalStories = ensureCategoryCoverage(
    applyDiversityCap(balanced, maxStoriesPerSource, targetStoryLimit),
    balanced,
    targetStoryLimit,
  )

  // BLINDATGE DE DRETS D'AUTOR: sigui quin sigui l'origen de la peça (fresca
  // d'aquest refresc o arrossegada d'un lot anterior amb el codi antic),
  // MAI publiquem la foto del mitjà. Aquí forcem que TOTES les peces del lot
  // final facin servir la il·lustració editorial pròpia. Vegeu storyImage.js.
  // BLINDATGE DE DRETS D'AUTOR (text + imatge): per a cada peça, titular propi,
  // il·lustració pròpia LLIGADA a la notícia (a partir d'una escena que genera la
  // IA) i sense resum copiat. applyOwnContent posa imatge pròpia a TOTES les
  // peces, així que cap foto de tercers pot colar-se. Vegeu src/server/storyText.js.
  const enrichedStories = await applyOwnContent(finalStories, env)

  // Una peça generada no és automàticament publicable. La barrera editorial
  // exigeix profunditat, frases específiques, impacte útil i font identificada.
  let qualityRejectedCount = 0
  const qualityRejectedByIssue = {}
  const publishedStories = selectPublishableStories(enrichedStories, {
    onReject: (story, result) => {
      qualityRejectedCount += 1
      for (const issue of result.issues) {
        qualityRejectedByIssue[issue] =
          (qualityRejectedByIssue[issue] || 0) + 1
      }
      console.warn(
        JSON.stringify({
          event: 'editorial.story.rejected',
          storyId: feedStoryId(story.url),
          source: story.source,
          issues: result.issues,
          bodyWords: result.metrics.bodyWords,
        }),
      )
    },
  })

  // Xarxa de seguretat: si en aquesta passada cap peça no ha assolit contingut
  // propi (p. ex. la IA no està disponible), mantenim el lot anterior en lloc de
  // buidar la portada.
  if (publishedStories.length === 0 && cached?.stories?.length) {
    const safeCachedStories = selectPublishableStories(cached.stories)
    if (safeCachedStories.length > 0) {
      return {
        ...cached,
        stories: safeCachedStories,
        cache: 'stale-incomplete',
        qualityRejectedCount,
        qualityRejectedByIssue,
      }
    }
  }

  // Fase 4: foto real de Wikimedia Commons només per a peces centrades en un
  // lloc concret. Els actes conserven la il·lustració pròpia; si Commons falla,
  // el radar no s'atura mai per una foto.
  try {
    await attachRealPhotos(publishedStories)
  } catch (error) {
    console.warn('[fotos] No s’han pogut cercar fotos reals', error?.message)
  }

  // Marquem com a "vistes" NOMÉS les noves que de debò entren al lot. Una
  // notícia acceptada que avui queda fora (pel sostre d'una altra llengua o per
  // diversitat de font) segueix sent elegible al pròxim refresc en lloc de
  // cremar-se. Així el català i el castellà no els devora l'allau anglesa.
  // PORTA D'APROVACIÓ HUMANA (13-08-2026). Fins aquí el radar ha fet la seva
  // feina: recollir, filtrar, redactar i il·lustrar. Ara decideix una persona.
  //
  // Les peces que JA són al lot públic no es tornen a jutjar: van passar la
  // porta en el seu dia, i tancar-les ara les faria desaparèixer del web i
  // trencaria enllaços que Google ja té indexats. Només es jutgen les noves.
  // Conseqüència volguda: si la base de dades no respon, les novetats s'aturen
  // però el diari d'ahir segueix dret.
  const publicUrls = new Set((cached?.stories || []).map((story) => story.url))
  const newcomers = publishedStories.filter((story) => !publicUrls.has(story.url))
  const decisions = await readDecisions(env, newcomers.map(candidateId))
  const {
    approved: approvedStories,
    pending: pendingStories,
    rejected: rejectedStories,
  } = splitByReviewDecision(publishedStories, { decisions, publicUrls })
  if (pendingStories.length > 0) {
    await recordPendingCandidates(env, pendingStories)
  }
  if (pendingStories.length > 0 || rejectedStories.length > 0) {
    console.log(
      JSON.stringify({
        event: 'review.gate.applied',
        approved: approvedStories.length,
        pending: pendingStories.length,
        rejected: rejectedStories.length,
      }),
    )
  }

  // Marquem com a "vistes" NOMÉS les noves que de debò entren al lot. Una
  // notícia acceptada que avui queda fora (pel sostre d'una altra llengua o per
  // diversitat de font) segueix sent elegible al pròxim refresc en lloc de
  // cremar-se. Així el català i el castellà no els devora l'allau anglesa.
  //
  // Les que esperen revisió també compten com a vistes: ja són a la sala
  // d'espera amb el text sencer desat, i tornar-les a recollir a cada passada
  // només gastaria feina per proposar el mateix.
  const shownFreshUrls = [...approvedStories, ...pendingStories]
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
    // MAI un diari en blanc. Si un dia no hi ha res aprovat —perquè ningú no ha
    // revisat i l'arrossegament ja ha caducat— val més deixar el lot d'ahir
    // dret que buidar la portada. El correu del matí ja avisa que hi ha peces
    // esperant; una pàgina en blanc no ho arreglaria i sí que espantaria Google.
    if (approvedStories.length === 0 && cached?.stories?.length) {
      console.warn(
        JSON.stringify({
          event: 'review.gate.nothing-approved',
          pending: pendingStories.length,
          keptFromPreviousEdition: cached.stories.length,
        }),
      )
      return { ...cached, cache: 'stale-awaiting-review' }
    }
    const payload = await setCachedPayload(kv, approvedStories)
    // Persistim sota story:<id> només les peces que entren per primer cop.
    // Les peces arrossegades ja tenen aquesta còpia i reescriure fins a 50 claus
    // a cada refresc consumia quota de KV sense canviar-ne el contingut.
    await Promise.all(
      storiesRequiringDetailPersistence(approvedStories, shownFreshUrls).map((story) =>
        kv.put(`story:${feedStoryId(story.url)}`, JSON.stringify(story), {
          expirationTtl: storyDetailTtlSeconds,
        }),
      ),
    )
    await updateEditorialStats(kv, {
      reviewed: reviewedThisPass,
      published: shownFreshUrls.length,
    })

    const cronDurationMs = Date.now() - runStartTime
    const todayKey = new Date().toISOString().slice(0, 10)
    const cronTiming = {
      runStartTime,
      cronDurationMs,
      reviewedThisPass,
      publishedCount: shownFreshUrls.length,
      totalStories: approvedStories.length,
      pendingReviewCount: pendingStories.length,
      qualityRejectedCount,
      qualityRejectedByIssue,
      // Deixa constància de quin cervell d'IA ha escrit aquesta edició, perquè
      // es pugui comprovar mirant el diagnòstic, sense obrir el codi.
      textProvider: activeTextProvider(env),
      updatedAt: new Date().toISOString(),
    }

    try {
      await kv.put('cron-timing:latest', JSON.stringify(cronTiming))
      const healthStats = await readFeedHealthStats(env)
      const dailySnapshot = {
        date: todayKey,
        cronTiming,
        feedHealthStats: healthStats,
        updatedAt: new Date().toISOString(),
      }
      await kv.put(
        `health-daily:${todayKey}`,
        JSON.stringify(dailySnapshot),
        { expirationTtl: 30 * 24 * 60 * 60 },
      )
    } catch (kvErr) {
      console.warn('[telemetria] No s’ha pogut desar el snapshot de salut diari', kvErr)
    }

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
      cronDurationMs,
      qualityRejectedCount,
      qualityRejectedByIssue,
    }
  } catch (error) {
    console.warn('No s’ha pogut escriure la memòria de notícies', error)
    const updatedAt = new Date().toISOString()
    return {
      updatedAt,
      nextRefreshAt: new Date(Date.now() + refreshIntervalMs).toISOString(),
      // També aquí el lot ha de ser el JA APROVAT: si l'escriptura a KV falla,
      // el que retornem alimenta la base de dades editorial, i deixar-hi passar
      // peces sense revisar les publicaria per la porta del darrere.
      stories: approvedStories,
      cache: 'transient',
      qualityRejectedCount,
      qualityRejectedByIssue,
    }
  }
}

// --- Secció "En directe" (ticker) ------------------------------------------
// A diferència de la portada (que es renova cada 12h amb titular, cos i
// il·lustració propis via IA), la tira "En directe" mostra els ÚLTIMS titulars
// detectats i enllaça directament a la font, sense generar pàgina ni contingut
// propi. Sí que passa pel MATEIX porter d'IA que la portada (aiReview) per triar
// només els titulars constructius. Es cacheja pocs minuts a KV per no re-scrapejar
// (ni re-jutjar) a cada visita.
const tickerCacheKey = 'live-ticker-v2'
// Un ticker constructiu no necessita reescriure KV cada 90 segons. Quinze minuts
// el manté actual i redueix el sostre teòric de 960 a 96 escriptures/dia. La clau
// es conserva una hora perquè continuï disponible com a fallback si fallen fonts
// o IA; la frescor es decideix amb updatedAt.
const tickerFreshnessMs = 15 * 60 * 1000
const tickerStorageTtlSeconds = 60 * 60

const tickerLimit = 12

export function storiesRequiringDetailPersistence(publishedStories, shownFreshUrls) {
  const freshUrls = new Set(shownFreshUrls)
  return publishedStories.filter((story) => freshUrls.has(story.url))
}

export function isTickerCacheFresh(cached, now = Date.now()) {
  const updatedAt = cached?.updatedAt ? new Date(cached.updatedAt).getTime() : 0
  return Boolean(updatedAt && now - updatedAt < tickerFreshnessMs)
}

export async function getLiveTicker(env, { force = false } = {}) {
  const kv = env?.LIVE_NEWS_KV
  // 1) Cache curta: mentre sigui fresca, la retornem tal qual.
  if (kv && !force) {
    try {
      const cached = await kv.get(tickerCacheKey, 'json')
      if (isTickerCacheFresh(cached)) {
        return { ...cached, cache: 'hit' }
      }
    } catch {
      // Si el KV falla, regenerem.
    }
  }

  // 2) Scrap ràpid d'un subconjunt de fonts.
  const now = Date.now()
  const healthStats = await readFeedHealthStats(env)
  const feeds = rssFeeds.filter((feed) => tickerFeedNames.includes(feed.name))
  const results = await Promise.all(
    feeds.map((feed) =>
      collectFeedStories(feed, {
        now,
        healthRecord: healthStats[feed.name],
        env,
      }),
    ),
  )

  let hasSignificantChange = false
  for (const res of results) {
    if (res.healthUpdate) {
      const oldRecord = healthStats[res.healthUpdate.name]
      if (isSignificantHealthChange(oldRecord, res.healthUpdate)) {
        hasSignificantChange = true
      }
      healthStats[res.healthUpdate.name] = res.healthUpdate
    }
  }
  if (hasSignificantChange) {
    await saveFeedHealthStats(env, healthStats)
  }

  const seen = new Set()
  const candidates = []
  for (const { stories } of results) {
    for (const story of stories) {
      if (!story.url || seen.has(story.url)) continue
      seen.add(story.url)
      candidates.push(story)
    }
  }

  // 3) CONTROL D'IA: el mateix porter que la portada (aiReview) decideix quins
  // titulars són realment constructius —no només per paraules clau—, de manera
  // que titulars neutres o negatius (onades de calor…) que abans es colaven ara
  // queden fora. Reutilitza el cau de veredictes (KV, 14 dies) compartit amb el
  // radar, així que el cost és baix. Aquí fallem de manera tancada: com que el
  // directe és opcional, si la IA no pot jutjar una peça és millor conservar la
  // darrera cache que publicar successos o meteorologia extrema.
  const topicalCandidates = candidates
    .map((story) => keepAllowedEditorialTopic(story))
    .filter(Boolean)
  const approved = await aiReview(env, topicalCandidates, { failOpen: false })
  approved.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  )

  const payload = {
    updatedAt: new Date().toISOString(),
    items: approved.slice(0, tickerLimit).map((story) => ({
      title: story.title,
      source: story.source,
      url: story.url,
      category: story.category,
      location: story.location,
      publishedAt: story.publishedAt,
    })),
  }

  // 3) Si no hem pogut treure res (fonts caigudes), conservem l'última cache.
  if (payload.items.length === 0 && kv) {
    try {
      const cached = await kv.get(tickerCacheKey, 'json')
      if (cached?.items?.length) return { ...cached, cache: 'stale' }
    } catch {
      // continuem
    }
  }

  if (kv && payload.items.length) {
    try {
      await kv.put(tickerCacheKey, JSON.stringify(payload), {
        expirationTtl: tickerStorageTtlSeconds,
      })
    } catch {
      // Si no es pot desar, igualment retornem el resultat.
    }
  }

  return { ...payload, cache: 'refresh' }
}
