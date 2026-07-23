// Catàleg i configuració de fonts RSS per al radar d'El Bon Diari.

export const refreshIntervalMs = 12 * 60 * 60 * 1000

export const targetStoryLimit = 50
export const maxStoriesPerSource = 8
export const collectionPoolSize = 80
export const maxStoriesPerLanguage = { es: 6, en: 3, fr: 1, it: 1, pt: 1 }

export const sections = []

export const rssFeeds = [
  // ===== FONTS AMPLIADES (jul. 2026): proximitat CAT, estatal i europeu =====
  { name: 'ARA', url: 'https://www.ara.cat/rss/latest/', language: 'ca', defaultCategory: 'Actualitat', core: true },
  { name: 'ARA Internacional', url: 'https://www.ara.cat/rss/internacional/', language: 'ca', defaultCategory: 'Internacional' },
  { name: 'ARA Cultura', url: 'https://www.ara.cat/rss/cultura/', language: 'ca', defaultCategory: 'Cultura' },
  { name: 'ARA Societat', url: 'https://www.ara.cat/rss/societat/', language: 'ca', defaultCategory: 'Societat' },
  { name: 'ARA Economia', url: 'https://www.ara.cat/rss/economia/', language: 'ca', defaultCategory: 'Economia' },
  { name: 'El 9 Nou Osona', url: 'https://el9nou.cat/feed/?post_type=post&edicio=osona-ripolles', language: 'ca', defaultCategory: 'Comarcal' },
  { name: 'El 9 Nou Valles', url: 'https://el9nou.cat/feed/?post_type=post&edicio=valles-oriental', language: 'ca', defaultCategory: 'Comarcal' },
  { name: 'AnoiaDiari', url: 'https://www.anoiadiari.cat/rss', language: 'ca', defaultCategory: 'Comarcal' },
  { name: "La Veu de l'Anoia", url: 'https://veuanoia.cat/feed/', language: 'ca', defaultCategory: 'Comarcal' },
  { name: "L'Independent de Gracia", url: 'https://www.independent.cat/rss', language: 'ca', defaultCategory: 'Local' },
  { name: 'Diari Mes', url: 'https://www.diarimes.com/ca/rss/home.xml', language: 'ca', defaultCategory: 'Comarcal' },
  { name: 'Aguaita', url: 'https://www.aguaita.cat/rss', language: 'ca', defaultCategory: 'Comarcal' },
  { name: 'Segre', url: 'https://www.segre.com/ca/rss/home.xml', language: 'ca', defaultCategory: 'Comarcal' },
  { name: 'La Directa', url: 'https://directa.cat/feed/', language: 'ca', defaultCategory: 'Societat' },
  { name: 'La Vanguardia Catalunya', url: 'https://www.lavanguardia.com/rss/local/catalunya.xml', language: 'es', defaultCategory: 'Actualitat' },
  { name: 'La Vanguardia Girona', url: 'https://www.lavanguardia.com/rss/local/girona.xml', language: 'es', defaultCategory: 'Local' },
  { name: 'La Vanguardia Tarragona', url: 'https://www.lavanguardia.com/rss/local/tarragona.xml', language: 'es', defaultCategory: 'Local' },
  { name: 'La Vanguardia Lleida', url: 'https://www.lavanguardia.com/rss/local/lleida.xml', language: 'es', defaultCategory: 'Local' },
  { name: 'elDiario.es', url: 'https://www.eldiario.es/rss/', language: 'es', defaultCategory: 'Actualitat' },
  { name: 'La Vanguardia', url: 'https://www.lavanguardia.com/rss/home.xml', language: 'es', defaultCategory: 'Actualitat' },
  { name: 'El Periodico', url: 'https://www.elperiodico.com/es/rss/sociedad/rss.xml', language: 'es', defaultCategory: 'Actualitat' },
  { name: 'Newtral', url: 'https://www.newtral.es/feed/', language: 'es', defaultCategory: 'Societat' },
  { name: 'The Local Spain', url: 'https://feeds.thelocal.com/rss/es', language: 'en', defaultCategory: 'Actualitat' },
  { name: 'POLITICO Europe', url: 'https://www.politico.eu/feed/', language: 'en', defaultCategory: 'Politica' },

  // ===================== CATALÀ =====================
  { name: 'Vilaweb', url: 'https://www.vilaweb.cat/feed/', language: 'ca', defaultCategory: 'Actualitat', core: true },
  { name: 'Nació Digital', url: 'https://www.naciodigital.cat/rss/', language: 'ca', defaultCategory: 'Actualitat', core: true },
  { name: 'El Món', url: 'https://elmon.cat/feed/', language: 'ca', defaultCategory: 'Actualitat' },
  { name: 'Capgròs', url: 'https://capgros.elnacional.cat/uploads/feeds/feed_ca.xml', language: 'ca', defaultCategory: 'Local', forceCategory: true, lenient: true, core: true },
  { name: 'Betevé', url: 'https://beteve.cat/feed/', language: 'ca', defaultCategory: 'Barcelona' },
  { name: 'Crític', url: 'https://www.elcritic.cat/feed', language: 'ca', defaultCategory: 'Periodisme' },
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

  // ===================== CASTELLÀ =====================
  { name: 'RTVE', url: 'https://www.rtve.es/rss/temas_noticias.xml', language: 'es', defaultCategory: 'Espanya', core: true },
  { name: '20minutos', url: 'https://www.20minutos.es/rss/', language: 'es', defaultCategory: 'Espanya' },
  { name: 'Europa Press', url: 'https://www.europapress.es/rss/rss.aspx', language: 'es', defaultCategory: 'Espanya' },
  { name: 'UN News', url: 'https://news.un.org/feed/subscribe/es/news/all/rss.xml', language: 'es', defaultCategory: 'Món' },

  // ===================== ANGLÈS =====================
  { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', language: 'en', defaultCategory: 'Món', core: true },
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
  { name: 'Euronews', url: 'https://www.euronews.com/rss?format=mrss', language: 'en', defaultCategory: 'Europa' },

  // ===================== PORTUGUÈS =====================
  { name: 'RTP Noticias', url: 'https://www.rtp.pt/noticias/rss', language: 'pt', defaultCategory: 'Món', core: true },

  // ===================== FRANCÈS =====================
  { name: 'France Info', url: 'https://www.francetvinfo.fr/titres.rss', language: 'fr', defaultCategory: 'Món', core: true },

  // ===================== ITALIÀ =====================
  { name: 'ANSA', url: 'https://www.ansa.it/sito/ansait_rss.xml', language: 'it', defaultCategory: 'Món', core: true },
]

export const rotatingPerLanguage = { ca: 5, es: 3, en: 2, fr: 1, it: 1, pt: 1 }

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
