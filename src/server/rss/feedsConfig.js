// Catàleg i configuració de fonts RSS per al radar d'El Bon Diari.

export const refreshIntervalMs = 12 * 60 * 60 * 1000

// La qualitat editorial passa davant del volum: una edició curta i completa és
// preferible a una portada llarga de breus superficials.
export const targetStoryLimit = 12
export const maxStoriesPerSource = 3
export const collectionPoolSize = 30
export const maxStoriesPerLanguage = { es: 6, en: 3, fr: 1, it: 1, pt: 1 }

export const sections = []

export const rssFeeds = [
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

  // ===================== CASTELLÀ (només obert/gratuït) =====================
  { name: 'RTVE', url: 'https://www.rtve.es/rss/temas_noticias.xml', language: 'es', defaultCategory: 'Espanya', core: true },
  { name: '20minutos', url: 'https://www.20minutos.es/rss/', language: 'es', defaultCategory: 'Espanya' },
  // Agències / serveis d'informació gratuïts (RSS oficial verificat).
  { name: 'Europa Press', url: 'https://www.europapress.es/rss/rss.aspx', language: 'es', defaultCategory: 'Espanya' },
  { name: 'UN News', url: 'https://news.un.org/feed/subscribe/es/news/all/rss.xml', language: 'es', defaultCategory: 'Món' },

  // ===================== ANGLÈS =====================
  { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', language: 'en', defaultCategory: 'Món', core: true },
  // Diaris de bones notícies (ja curats: passen sense exigir paraula positiva).
  { name: 'Positive News', url: 'https://www.positive.news/feed/', language: 'en', defaultCategory: 'Món', lenient: true, curated: true, core: true },
  { name: 'Good News Network', url: 'https://www.goodnewsnetwork.org/feed/', language: 'en', defaultCategory: 'Món', lenient: true, curated: true },
  { name: 'Reasons to be Cheerful', url: 'https://reasonstobecheerful.world/feed/', language: 'en', defaultCategory: 'Món', lenient: true, curated: true },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', language: 'en', defaultCategory: 'Món' },
  { name: 'CNN', url: 'http://rss.cnn.com/rss/edition.rss', language: 'en', defaultCategory: 'Món' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'Sky News', url: 'https://feeds.skynews.com/feeds/rss/world.xml', language: 'en', defaultCategory: 'Món' },
  { name: 'The Independent', url: 'https://www.independent.co.uk/news/world/rss', language: 'en', defaultCategory: 'Món' },
  { name: 'The Conversation', url: 'https://theconversation.com/articles.atom', language: 'en', defaultCategory: 'Coneixement' },
  { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', language: 'en', defaultCategory: 'Ciència', forceCategory: true },
  { name: 'Phys.org', url: 'https://phys.org/rss-feed/', language: 'en', defaultCategory: 'Ciència', forceCategory: true },
  { name: 'BBC Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', language: 'en', defaultCategory: 'Ciència', forceCategory: true },
  { name: 'Guardian Science', url: 'https://www.theguardian.com/science/rss', language: 'en', defaultCategory: 'Ciència', forceCategory: true },
  { name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', language: 'en', defaultCategory: 'Tecnologia', forceCategory: true },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', language: 'en', defaultCategory: 'Tecnologia', forceCategory: true },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', language: 'en', defaultCategory: 'Tecnologia', forceCategory: true },
  { name: 'Guardian Culture', url: 'https://www.theguardian.com/culture/rss', language: 'en', defaultCategory: 'Cultura', forceCategory: true },
  { name: 'Smithsonian', url: 'https://www.smithsonianmag.com/rss/latest_articles/', language: 'en', defaultCategory: 'Cultura', forceCategory: true },
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
export const rotatingPerLanguage = { ca: 12, es: 6, en: 2, fr: 1, it: 1, pt: 1 }

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

export const tickerFeedNames = ['Vilaweb', 'Nació Digital', 'Betevé', 'Capgròs', 'El Món', 'Crític']
