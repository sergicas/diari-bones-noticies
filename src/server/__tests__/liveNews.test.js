// Tests del cervell editorial de bondiari.com.
// Cobreixen els tres sistemes més crítics: filtre positiu/negatiu per idioma,
// detector de publicitat encoberta i sostre per font.
//
// Executar amb: npm test

import { describe, it, expect } from 'vitest'
import {
  passesEditorialFilter,
  looksLikeAdvertorial,
  applyDiversityCap,
  capPerCategory,
  UNIVERSAL_NEG,
  POLITICAL_MARKERS,
  normalizeFeedItem,
  normalizeAgendaItem,
  normalizeRaiscOpportunity,
  normalizeIdescatUpdate,
  isStoryWithinLiveWindow,
  isTickerCacheFresh,
  storiesRequiringDetailPersistence,
  getLiveNewsPayload,
  keepsEditorialClearance,
} from '../liveNews.js'
import {
  normalizeCategory,
  canonicalizeCategory,
  refineCategoryByContent,
} from '../../lib/category.js'
import { feedStoryId } from '../../lib/story-id.js'
import {
  injectStoryMeta,
  buildNewsArticleJsonLd,
  buildArticleBodyHtml,
} from '../storyMeta.js'
import { buildNewsSitemap } from '../newsSitemap.js'
import { composePostText, storyLink } from '../social.js'
import { applyOwnContent } from '../storyText.js'

const SEO_STORY = {
  title: 'Una cooperativa <crea> vint llocs de treball',
  summary: 'La bona notícia arriba al poble amb un projecte replicable.',
  category: 'Economia',
  source: 'Diari Local',
  url: 'https://exemple.cat/noticia-x',
  imageUrl: 'https://exemple.cat/foto.jpg',
  publishedAt: '2026-07-03T09:00:00Z',
  kicker: 'Economia social',
  body: ['Primer paràgraf.', 'Segon paràgraf.'],
  language: 'ca',
}

describe('quota KV — escriptures acotades', () => {
  it('manté el ticker fresc durant quinze minuts', () => {
    const now = Date.parse('2026-07-23T08:00:00Z')
    expect(
      isTickerCacheFresh({ updatedAt: '2026-07-23T07:46:00Z' }, now),
    ).toBe(true)
    expect(
      isTickerCacheFresh({ updatedAt: '2026-07-23T07:44:59Z' }, now),
    ).toBe(false)
  })

  it('només persisteix el detall de les peces noves', () => {
    const stories = [
      { url: 'https://bondiari.com/nova' },
      { url: 'https://bondiari.com/arrossegada' },
    ]
    expect(
      storiesRequiringDetailPersistence(stories, ['https://bondiari.com/nova']),
    ).toEqual([{ url: 'https://bondiari.com/nova' }])
  })

  it('la lectura pública respon immediatament si no hi ha caché', async () => {
    const kv = {
      get: async () => null,
      put: async () => {
        throw new Error('una lectura pública no ha d’escriure')
      },
    }

    await expect(
      getLiveNewsPayload(kv, { allowRefresh: false }),
    ).resolves.toMatchObject({
      stories: [],
      cache: 'miss-readonly',
    })
  })

  it('la lectura pública serveix la caché antiga sense regenerar-la', async () => {
    const cached = {
      updatedAt: '2025-01-01T00:00:00.000Z',
      nextRefreshAt: '2025-01-01T12:00:00.000Z',
      stories: [{ id: 'edicio-estable', editorialVersion: 1 }],
    }
    const kv = {
      get: async () => cached,
      put: async () => {
        throw new Error('una lectura pública no ha d’escriure')
      },
    }

    await expect(
      getLiveNewsPayload(kv, { allowRefresh: false }),
    ).resolves.toEqual({
      ...cached,
      cache: 'stale-readonly',
    })
  })
})

describe('resultats d’empresa — comptes, no bones notícies', () => {
  const advertorial = (title) =>
    looksLikeAdvertorial({ url: 'https://elmon.cat/peca', title, summary: '' })

  // Colat el 27/07/2026 tant a la tira "Últimes incorporacions" com a la
  // portada. El porter de positivitat no ho veia (cap paraula negativa) i el
  // model ho aprovava, així que calia un bloc dur.
  it('bloca la presentació de comptes i la nota de premsa corporativa', () => {
    for (const title of [
      'Mango factura 1.852 milions d’euros en els primers sis mesos de l’any',
      'B. Braun reforça l’accés a la diàlisi durant les vacances a través del seu programa Holiday Dialysis',
      'La facturación del grupo crece un 7,2%',
      'El grupo presenta sus resultados del primer semestre',
      'La companyia tanca l’exercici amb un benefici net rècord',
    ]) {
      expect(advertorial(title), title).toBe(true)
    }
  })

  // El bloc mira el senyal financer precís, no la paraula "empresa": una bona
  // notícia econòmica de veritat ha de continuar entrant.
  it('deixa passar l’economia constructiva', () => {
    for (const title of [
      'Una cooperativa del Maresme crea vint llocs de treball al mercat municipal',
      'La fàbrica de Sant Andreu reobre i recontracta cinquanta treballadors',
      'Un poble de la Segarra recupera la seva escola amb un projecte comunitari',
      'Els beneficis de caminar mitja hora al dia, segons un estudi',
    ]) {
      expect(advertorial(title), title).toBe(false)
    }
  })

  // L'altre gènere de nota de premsa: no anuncia cap fet, l'organització es
  // proclama referent o pionera. Colat el 27/07 a la tira d'últimes
  // incorporacions ("GBSB Global consolida un model educatiu pioner...").
  it('bloca l’autobombo institucional', () => {
    for (const title of [
      'GBSB Global consolida un model educatiu pioner per formar els professionals que exigeix la nova economia',
      'Jorcar Titanium lidera la innovació a Lliçà de Vall amb reciclatge',
      'La companyia es consolida com a referent del sector',
      'La empresa se posiciona como líder en el mercado europeo',
      'La firma apuesta por la excelencia en el servicio',
    ]) {
      expect(advertorial(title), title).toBe(true)
    }
  })

  // Es bloca la col·locació sencera (verb de posicionament + superlatiu de
  // màrqueting), no els verbs sols: liderar, consolidar i impulsar són verbs
  // normals del periodisme.
  it('no confon liderar, consolidar o impulsar amb autobombo', () => {
    for (const title of [
      "Un institut de Girona lidera un projecte europeu contra l'abandonament escolar",
      'Una investigadora catalana lidera la missió europea a Mart',
      'El barri consolida la seva xarxa de suport a la gent gran',
      'El Govern impulsa un model educatiu inclusiu a les escoles rurals',
      'La ciutat impulsa un pla de xoc contra la pobresa energètica',
    ]) {
      expect(advertorial(title), title).toBe(false)
    }
  })

  // En JavaScript "ó" no és caràcter de paraula, així que /facturaci[óo]n?\b/
  // casava amb el castellà "facturación" però NO amb el català "facturació".
  // Els blocs es tanquen amb "no vingui cap més lletra".
  it('bloca igual el català accentuat que el castellà', () => {
    expect(advertorial('La facturació del grup creix un 7,2%')).toBe(true)
    expect(advertorial('La facturación del grupo crece un 7,2%')).toBe(true)
  })

  it('neteja el marcador d’objecte incrustat que alguns mitjans deixen al titular', () => {
    const story = normalizeFeedItem(
      `
      <title><![CDATA[La Fageda estima el valor social que genera ￼]]></title>
      <link>https://elmon.cat/fageda</link>
      <description><![CDATA[La cooperativa presenta el seu informe anual amb dades verificades.]]></description>
      <pubDate>Mon, 27 Jul 2026 08:00:00 +0000</pubDate>
      <media:thumbnail url="https://elmon.cat/foto.jpg" />
    `,
      { name: 'El Món', language: 'ca', defaultCategory: 'Actualitat' },
    )

    expect(story.title).toBe('La Fageda estima el valor social que genera')
    expect(story.title).not.toContain('￼')
  })
})

describe('arrossegament del lot — el diari ha d’acumular', () => {
  // Regressió del 27-07-2026: l'arrossegament tornava a passar el porter de
  // positivitat sobre el text PUBLICAT, però una peça publicada té el titular
  // reescrit i el resum esborrat. Cap titular no duia paraula positiva, així
  // que el lot es buidava a cada refresc (10 peces → 7 en tres minuts) i el
  // diari no acumulava mai.
  it('conserva una peça ja aprovada encara que el titular no dugui cap paraula positiva', () => {
    const publicada = {
      title: 'El Castell de Montjuïc obre fins tard per veure l’eclipsi solar',
      summary: '', // applyOwnContent l'esborra per no reproduir el text del mitjà
      language: 'ca',
      editorialFormat: 'constructive',
      editorialVersion: 18,
    }
    // El porter, tot sol, la faria caure: aquest és l'error que es corregeix.
    expect(passesEditorialFilter(publicada.title, 'ca').passes).toBe(false)
    expect(keepsEditorialClearance(publicada, 18)).toBe(true)
  })

  it('conserva les peces que va rescatar la IA, que mai no passaven per paraula clau', () => {
    const rescatadaPerIa = {
      title: 'Experts suggest searching for alien signals in new ways',
      summary: '',
      language: 'en',
      editorialFormat: 'constructive',
      editorialScore: 0, // neutra: va entrar pel veredicte de la IA
      editorialVersion: 18,
    }
    expect(keepsEditorialClearance(rescatadaPerIa, 18)).toBe(true)
  })

  it('descarta el lot quan es pugen les regles editorials', () => {
    const velles = {
      title: 'Una peça aprovada amb les regles anteriors',
      editorialFormat: 'constructive',
      editorialVersion: 17,
    }
    expect(keepsEditorialClearance(velles, 18)).toBe(false)
  })

  it('els formats de servei no depenen del porter de positivitat', () => {
    for (const format of ['verification', 'data', 'agenda', 'opportunity']) {
      expect(
        keepsEditorialClearance({ editorialFormat: format, editorialVersion: 1 }, 18),
      ).toBe(true)
    }
  })
})

describe('SEO — JSON-LD NewsArticle', () => {
  it('genera un NewsArticle vàlid amb els camps clau', () => {
    const ld = JSON.parse(
      buildNewsArticleJsonLd(SEO_STORY, 'https://bondiari.com/noticia/x').replace(/\\u003c/g, '<'),
    )
    expect(ld['@type']).toBe('NewsArticle')
    expect(ld.headline).toBe(SEO_STORY.title)
    expect(ld.datePublished).toBe(SEO_STORY.publishedAt)
    expect(ld.articleSection).toBe('Economia')
    expect(ld.publisher.logo.url).toMatch(/logo-colibri\.png$/)
  })

  it('escapa "<" perquè no pugui tancar el <script>', () => {
    expect(buildNewsArticleJsonLd(SEO_STORY, 'https://bondiari.com/x')).not.toContain('</')
  })
})

describe('SEO — cos de l\'article per a crawlers', () => {
  it('inclou h1, data i paràgrafs, i escapa el HTML', () => {
    const body = buildArticleBodyHtml(SEO_STORY)
    expect(body).toContain('<h1>')
    expect(body).toContain('<time datetime="2026-07-03T09:00:00Z">')
    expect(body).toContain('Primer paràgraf.')
    expect(body).toContain('&lt;crea&gt;')
    expect(body).not.toContain('<crea>')
  })
})

describe('SEO — injectStoryMeta', () => {
  const html =
    '<!doctype html><html><head><title>El Bon Diari</title>' +
    '<meta property="og:type" content="website" />' +
    '<meta property="og:title" content="X" />' +
    '<meta name="description" content="X" />' +
    '<link rel="canonical" href="https://bondiari.com/" /></head>' +
    '<body><div id="root"></div></body></html>'
  const out = injectStoryMeta(html, SEO_STORY, 'https://bondiari.com/noticia/x')

  it('posa og:type=article, dates, JSON-LD, canonical i cos a #root', () => {
    expect(out).toContain('og:type" content="article"')
    expect(out).toContain('article:published_time')
    expect(out).toContain('application/ld+json')
    expect(out).toContain('canonical" href="https://bondiari.com/noticia/x"')
    expect(out).toMatch(/<div id="root"><article>/)
  })
})

describe('SEO — news sitemap (Google News)', () => {
  const now = Date.parse('2026-07-03T12:00:00Z')
  const xml = buildNewsSitemap(
    [
      SEO_STORY,
      { title: 'Vella', url: 'https://x.cat/vella', publishedAt: '2026-06-01T00:00:00Z', language: 'ca' },
    ],
    now,
  )

  it('inclou les peces de <48h amb tags news: i exclou les velles', () => {
    expect(xml).toContain('sitemap-news/0.9')
    expect(xml).toContain('<news:publication_date>')
    expect(xml).toContain('cooperativa')
    expect(xml).not.toContain('Vella')
  })
})

describe('refineCategoryByContent — correcció per contingut', () => {
  it('reubica una exposició de fotografia a Cultura (cas "Minor White")', () => {
    expect(
      refineCategoryByContent(
        'Gastronomia',
        'Minor White, dimensión espiritual de la fotografía',
        'La Fundación Mapfre presenta en el KBr de Barcelona una retrospectiva del fotógrafo.',
      ),
    ).toBe('Cultura')
  })

  it('treu d\'Esports un tema de TV sense cap senyal esportiu (cas "El sótano club")', () => {
    expect(
      refineCategoryByContent(
        'Esports',
        "'El sótano club', de Alba Carrillo: Hablar sin el brazo en alto",
        'Sarah Santaolalla estuvo en el programa de televisión.',
      ),
    ).toBe('Societat')
  })

  it('respecta Esports quan SÍ que hi ha senyal esportiu', () => {
    expect(
      refineCategoryByContent('Esports', 'El Barça guanya la lliga amb un gol al descompte', ''),
    ).toBe('Esports')
  })

  it('no toca una categoria correcta sense senyals', () => {
    expect(refineCategoryByContent('Ciència', 'Una nova iniciativa veïnal', '')).toBe('Ciència')
  })
})

describe('UNIVERSAL_NEG — exclusió temàtica', () => {
  it('bloqueja rècords de mercat (cas Nasdaq per volum)', () => {
    expect(
      UNIVERSAL_NEG.test(
        'spacex lleva al nasdaq a registrar el mejor semestre de su historia en volumen de negociación',
      ),
    ).toBe(true)
  })

  it('bloqueja tertúlia i premsa del cor', () => {
    expect(UNIVERSAL_NEG.test("'el sótano club', de alba carrillo")).toBe(true)
    expect(UNIVERSAL_NEG.test('la tertulia de gran hermano')).toBe(true)
  })

  it('bloqueja focs actius i rècords de calor locals', () => {
    expect(UNIVERSAL_NEG.test('ensurt per un foc al parc forestal de mataró')).toBe(true)
    expect(
      UNIVERSAL_NEG.test('mataró frega els 38 graus en una jornada excepcional'),
    ).toBe(true)
  })

  it('bloqueja el soroll de política de conflicte al voltant de Trump (colat el 07/07)', () => {
    expect(
      UNIVERSAL_NEG.test(
        'l’annulation du carton rouge de balogun est-elle un cadeau d’infantino à trump ?',
      ),
    ).toBe(true)
  })

  it('no bloqueja una paraula que només conté "trump" per casualitat', () => {
    // \\btrump\\b evita falsos positius com "trumpet" (trompeta).
    expect(UNIVERSAL_NEG.test('un concert de trumpet solo al conservatori')).toBe(false)
  })

  it('no bloqueja una bona notícia normal', () => {
    expect(
      UNIVERSAL_NEG.test('una cooperativa crea vint llocs de treball al poble'),
    ).toBe(false)
  })
})

describe('POLITICAL_MARKERS — maniobra de partit', () => {
  it('bloqueja el traspàs de culpes entre càrrecs (cas Cabezas/Argimon, 07/07)', () => {
    // "vacunació" feia positiu el text; el marcador polític "desvincula" el cau.
    expect(
      POLITICAL_MARKERS.test(
        'cabezas desvincula argimon del retard en la vacunació de policies espanyols',
      ),
    ).toBe(true)
  })

  it('no marca com a política una bona notícia de salut sense baralla', () => {
    expect(
      POLITICAL_MARKERS.test('comença la vacunació gratuïta contra la grip al barri'),
    ).toBe(false)
  })
})

describe('formats editorials de servei', () => {
  const verificationItem = `
    <title><![CDATA[No, aquesta imatge de Trump durant la guerra no és real]]></title>
    <link>https://www.verificat.cat/comprovacio-exemple/</link>
    <description><![CDATA[La fotografia viral ha estat generada amb intel·ligència artificial.]]></description>
    <content:encoded><![CDATA[Els verificadors han comparat la imatge amb fotografies originals i han localitzat errors visuals incompatibles amb l’escena real.]]></content:encoded>
    <pubDate>Thu, 23 Jul 2026 08:00:00 +0000</pubDate>
    <media:thumbnail url="https://www.verificat.cat/imatge.jpg" />
  `

  it('admet una verificació fiable encara que citi el rumor que desmenteix', () => {
    const story = normalizeFeedItem(verificationItem, {
      name: 'Verificat',
      language: 'ca',
      defaultCategory: 'Verificació',
      forceCategory: true,
      editorialMode: 'verification',
      sourceTier: 'B',
    })

    expect(story).toMatchObject({
      category: 'Verificació',
      editorialFormat: 'verification',
      source: 'Verificat',
      sourceTier: 'B',
      curated: true,
    })
    expect(story.ownContent).toBeUndefined()
    expect(story.body).toBeUndefined()
    expect(story.sourceContext).toContain('errors visuals')
  })

  it('manté el mateix contingut fora del radar positiu si no és una verificació', () => {
    const story = normalizeFeedItem(verificationItem, {
      name: 'Mitjà generalista',
      language: 'ca',
      defaultCategory: 'Actualitat',
    })

    expect(story).toBeNull()
  })

  it('normalitza l’Agenda Cultural com a proposta local accionable', () => {
    const story = normalizeAgendaItem(
      `
        <title>Les Santes de Mataró</title>
        <link>https://agenda.cultura.gencat.cat:443/activitat</link>
        <description>Programa de la festa major del 25 al 29 de juliol, amb concerts al Parc Central, activitats familiars, cultura popular i accés gratuït a la majoria dels actes.</description>
      `,
      '2026-07-23T08:00:00.000Z',
    )

    expect(story).toMatchObject({
      category: 'Agenda',
      editorialFormat: 'agenda',
      location: 'Mataró, Maresme',
      sourceTier: 'A',
      ownContent: false,
    })
    expect(story.sourceContext).toContain('Parc Central')
    expect(story.url).not.toContain(':443')
  })

  it('converteix una convocatòria RAISC oberta en una oportunitat', () => {
    const story = normalizeRaiscOpportunity({
      objecte_de_la_convocat_ria: 'Ajuts per a projectes culturals',
      url_diari_oficial: 'https://dogc.gencat.cat/ajut',
      data_diari_oficial: '2026-07-20T00:00:00.000',
      data_fi_termini_presentaci_sol_licitud: '2026-07-31T00:00:00.000',
      tipus_de_beneficiaris: 'Entitats sense ànim de lucre',
      import_total_convocat_ria: '400000',
      regio_apli: 'CATALUNYA',
    })

    expect(story).toMatchObject({
      category: 'Oportunitats',
      editorialFormat: 'opportunity',
      expiresAt: '2026-07-31T00:00:00.000',
      source: 'Dades Obertes de Catalunya · RAISC',
      ownContent: true,
    })
    expect(story.summary).toContain('400.000')
    expect(story.body.join(' ')).toContain('31/7/2026')
  })

  it('converteix una actualització d’Idescat en una peça d’El marcador', () => {
    const story = normalizeIdescatUpdate({
      id: 't12',
      c: "Construcció d'habitatges",
      r: '2025',
      updated: '2026-07-20T10:00:00+00:00',
      l: 'https://www.idescat.cat/pub/?id=habit',
      ff: {
        f: [
          { c: 'Habitatges protegits iniciats', v: '34,188,3128' },
          { c: 'Habitatges iniciats', v: '187,840,15589' },
        ],
      },
    })

    expect(story).toMatchObject({
      category: 'Dades',
      editorialFormat: 'data',
      source: 'Idescat',
      ownContent: true,
    })
    expect(story.summary).toContain('Habitatges iniciats: 187')
  })

  it('manté una oportunitat a portada fins al final del dia del termini', () => {
    const story = {
      publishedAt: '2026-07-01T00:00:00.000Z',
      expiresAt: '2026-07-23T00:00:00.000Z',
    }
    expect(
      isStoryWithinLiveWindow(story, Date.parse('2026-07-23T20:00:00.000Z')),
    ).toBe(true)
    expect(
      isStoryWithinLiveWindow(story, Date.parse('2026-07-24T00:00:00.000Z')),
    ).toBe(false)
  })

  it('manté vigents les verificacions i els indicadors més enllà de quatre dies', () => {
    const now = Date.parse('2026-07-23T12:00:00.000Z')
    expect(
      isStoryWithinLiveWindow(
        {
          publishedAt: '2026-07-01T12:00:00.000Z',
          editorialFormat: 'verification',
        },
        now,
      ),
    ).toBe(true)
    expect(
      isStoryWithinLiveWindow(
        {
          publishedAt: '2026-01-01T12:00:00.000Z',
          editorialFormat: 'data',
        },
        now,
      ),
    ).toBe(true)
  })

  it('publica el contingut de servei ja normalitzat sense tornar a dependre de la IA', async () => {
    const story = normalizeRaiscOpportunity({
      objecte_de_la_convocat_ria: 'Ajuts per a projectes culturals',
      url_diari_oficial: 'https://dogc.gencat.cat/ajut',
      data_diari_oficial: '2026-07-20T00:00:00.000',
      data_fi_termini_presentaci_sol_licitud: '2026-07-31T00:00:00.000',
      tipus_de_beneficiaris: 'Entitats sense ànim de lucre',
    })

    const [published] = await applyOwnContent([story], {})

    expect(published).toMatchObject({
      title: 'Ajuts per a projectes culturals',
      ownContent: true,
      editorialFormat: 'opportunity',
    })
    expect(published.body.join(' ')).toContain('Entitats sense ànim de lucre')
  })
})

describe('capPerCategory — varietat temàtica', () => {
  it('limita Cultura i Verificació sense reordenar la resta', () => {
    const stories = [
      ...Array.from({ length: 5 }, (_, i) => ({ category: 'Cultura', id: `c${i}` })),
      ...Array.from({ length: 4 }, (_, i) => ({ category: 'Verificació', id: `v${i}` })),
      { category: 'Ciència', id: 's1' },
    ]
    const result = capPerCategory(stories)
    expect(result.filter((story) => story.category === 'Cultura')).toHaveLength(3)
    expect(result.filter((story) => story.category === 'Verificació')).toHaveLength(2)
    expect(result.at(-1).id).toBe('s1')
  })
})

describe('passesEditorialFilter — català', () => {
  it('deixa passar una notícia clarament positiva', () => {
    const result = passesEditorialFilter(
      "Un voluntariat ajuda a recuperar un barri amb una iniciativa premiada",
      'ca',
    )
    expect(result.passes).toBe(true)
    expect(result.isPositive).toBe(true)
    expect(result.isNegative).toBe(false)
  })

  it('descarta una notícia amb paraula negativa, fins i tot si hi ha positives', () => {
    const result = passesEditorialFilter(
      "Una iniciativa solidària ajuda les víctimes de la guerra",
      'ca',
    )
    expect(result.passes).toBe(false)
    expect(result.isNegative).toBe(true)
  })

  it('descarta una notícia sense cap paraula positiva', () => {
    const result = passesEditorialFilter("Reunió ordinària del consell municipal", 'ca')
    expect(result.passes).toBe(false)
    expect(result.isPositive).toBe(false)
  })

  it('descarta verbs de mort/agressió (regression del cas "Maten a trets")', () => {
    expect(passesEditorialFilter("Maten a trets un home al carrer Balmes", 'ca').passes).toBe(false)
    expect(passesEditorialFilter("Apunyalen un veí al barri", 'ca').passes).toBe(false)
  })

  it('descarta atemptats, vagues i violència', () => {
    expect(passesEditorialFilter("La ciutat estrena una nova plaça malgrat l'atemptat de fa un any", 'ca').passes).toBe(false)
    expect(passesEditorialFilter("Premi a la mestra a pesar de la vaga", 'ca').passes).toBe(false)
  })

  it('deixa passar paraules positives variades', () => {
    expect(passesEditorialFilter("Inauguren una nova biblioteca al barri", 'ca').passes).toBe(true)
    expect(passesEditorialFilter("Descobreixen un nou ecosistema marí", 'ca').passes).toBe(true)
    expect(passesEditorialFilter("Reconeixen la trajectòria del mestre amb un homenatge", 'ca').passes).toBe(true)
  })

  // Des que el diccionari reconeix "rescaten" (27/07/2026), un titular de
  // pastera amb la paraula rescat SÍ que té paraula positiva. Segueix quedant
  // fora, però ara per la via del bloc dur i no per absència de positius. La
  // prova comprova l'exclusió EFECTIVA, que és el que importa.
  it('descarta immigració marítima/naufragis (regression "Arriben dues pasteres a Formentera")', () => {
    const exclosa = (t, lang = 'ca') =>
      !passesEditorialFilter(t, lang).passes || UNIVERSAL_NEG.test(t.toLowerCase())
    expect(exclosa('Arriben dues pasteres amb 25 persones a Formentera')).toBe(true)
    expect(exclosa('Rescaten un cayuco amb desenes de persones')).toBe(true)
    expect(exclosa('Llegan varias pateras a las costas de Almería', 'es')).toBe(true)
    // Però una notícia bona amb la mateixa paraula "arriben" segueix passant:
    expect(passesEditorialFilter("Arriben els premis a la millor iniciativa solidària del barri", 'ca').passes).toBe(true)
  })

  it('descarta pujada de preus i turistificació (regression "Hotels plens i preus més alts")', () => {
    expect(passesEditorialFilter("Hotels plens i preus més alts abans del Grand Départ del Tour a Barcelona", 'ca').passes).toBe(false)
    expect(passesEditorialFilter("Suben los precios y se masifica el centro por el turismo", 'es').passes).toBe(false)
  })

  it('"arriba/arribada" ja no és un passi lliure (era el forat de pasteres i hotels)', () => {
    // Sense cap altra paraula positiva, "arriba" ja no marca la notícia com a bona.
    expect(passesEditorialFilter("Arriba el Tour de França a Barcelona", 'ca').isPositive).toBe(false)
    expect(passesEditorialFilter("Llega el verano a la costa", 'es').isPositive).toBe(false)
  })

  it('els verbs DIRECCIONALS neutres ja no són passi lliure (creix, obre, amplia, aposta...)', () => {
    // Casos en què la direcció és clarament DOLENTA: no han de marcar isPositive.
    expect(passesEditorialFilter("Creix l'atur a Catalunya", 'ca').isPositive).toBe(false)
    expect(passesEditorialFilter("Obre una investigació contra l'alcalde", 'ca').isPositive).toBe(false)
    expect(passesEditorialFilter("Crece la deuda pública", 'es').isPositive).toBe(false)
    expect(passesEditorialFilter("Abre diligencias por el caso", 'es').isPositive).toBe(false)
    // Però el que és bo de debò segueix passant per altres paraules:
    expect(passesEditorialFilter("Inauguren una biblioteca i premien la iniciativa solidària", 'ca').passes).toBe(true)
  })
})

describe('passesEditorialFilter — castellà', () => {
  it('deixa passar peça positiva en castellà', () => {
    expect(passesEditorialFilter("Logra mejorar la salud con una iniciativa solidaria", 'es').passes).toBe(true)
  })

  it('descarta atentado/ataque/asesinato', () => {
    expect(passesEditorialFilter("Atentado contra la sede del partido tras el éxito electoral", 'es').passes).toBe(false)
    expect(passesEditorialFilter("Ataque mortal a la salida del colegio", 'es').passes).toBe(false)
    expect(passesEditorialFilter("Asesinato sin esclarecer aún", 'es').passes).toBe(false)
  })

  it('descarta fichajes esportius', () => {
    expect(passesEditorialFilter("Fichaje millonario del Real Madrid", 'es').passes).toBe(false)
    expect(passesEditorialFilter("Ficha por el Barça tras la mejora del Atlético", 'es').passes).toBe(false)
  })

  it('descarta querelles judicials', () => {
    expect(passesEditorialFilter("Dirigentes del PSOE piden que se querelle", 'es').passes).toBe(false)
  })

  it('descarta successos de delinqüència (regression "banda del Vaticano")', () => {
    const text =
      'Dios no estuvo de su lado: la banda del Vaticano cae tras un mes ' +
      'frenético de atracos y disfraces. La carrera delictiva de un grupo que ' +
      'asaltaba joyerías en Madrid acaba con dos de ellos disfrazados de monja ' +
      'y cura. Tenían antecedentes por hurtos y avanzaron en su escalada criminal'
    expect(passesEditorialFilter(text, 'es').passes).toBe(false)
  })

  it('descarta el mateix terme en majúscules i minúscules', () => {
    expect(passesEditorialFilter("LOGRA EL ÉXITO HISTÓRICO", 'es').passes).toBe(true)
    expect(passesEditorialFilter("ASESINATO EN PLENA CALLE TRAS LOGRO HISTÓRICO", 'es').passes).toBe(false)
  })
})

describe('passesEditorialFilter — actualitat tensa (no és "bona notícia")', () => {
  it('descarta trucades d\'emergència filtrades (cas Andic al 112)', () => {
    const text = 'Filtren la trucada de Jonathan Andic al 112: Necessito ajuda, el meu ' +
      'pare ha caigut. El pèrit diu que la conversa demostra la desesperació del fill'
    expect(passesEditorialFilter(text, 'ca').passes).toBe(false)
  })

  it('descarta política d\'exclusió i odi (extrema dreta, fonamentalisme)', () => {
    const text = "El PP català copia l'extrema dreta en immigració: defensa l'expulsió " +
      "d'immigrants irregulars que delinqueixin i alerta del fonamentalisme islàmic"
    expect(passesEditorialFilter(text, 'ca').passes).toBe(false)
    expect(passesEditorialFilter("La extrema derecha gana terreno con su discurso xenófobo", 'es').passes).toBe(false)
  })

  it('descarta atacs polítics i difamació (smear/marred)', () => {
    expect(passesEditorialFilter("UFC fights at White House marred by smear aimed at the former first lady", 'en').passes).toBe(false)
  })

  it('descarta insults polítics, jutjats i sancions (casos del 17/06)', () => {
    expect(passesEditorialFilter("Feijóo llama cobarde a Sánchez y asegura que no es un demócrata tras el éxito", 'es').passes).toBe(false)
    expect(passesEditorialFilter("El PSOE considera frau de llei les esmenes que avancen al Parlament", 'ca').passes).toBe(false)
    expect(passesEditorialFilter("El G-7 acuerda reforzar las sanciones a Rusia pese al acuerdo", 'es').passes).toBe(false)
    expect(passesEditorialFilter("Zapatero arriba a l'Audiència Nacional per declarar, una fita judicial", 'ca').passes).toBe(false)
  })
})

describe('passesEditorialFilter — anglès', () => {
  it('deixa passar peça positiva en anglès', () => {
    expect(passesEditorialFilter("Scientists achieve a breakthrough in cancer research", 'en').passes).toBe(true)
  })

  it('descarta war, killed, attack, missile', () => {
    expect(passesEditorialFilter("Drone strike killed civilians", 'en').passes).toBe(false)
    expect(passesEditorialFilter("War escalates between two nations", 'en').passes).toBe(false)
    expect(passesEditorialFilter("Successful attack on the headquarters", 'en').passes).toBe(false)
    expect(passesEditorialFilter("Missile defence successfully launched", 'en').passes).toBe(false)
  })

  it('descarta transfer market, signs for, podcast', () => {
    expect(passesEditorialFilter("Striker signs for Premier League club", 'en').passes).toBe(false)
    expect(passesEditorialFilter("Podcast on the markets is now live", 'en').passes).toBe(false)
  })
})

describe('passesEditorialFilter — francès', () => {
  it('deixa passar peça positiva en francès', () => {
    expect(passesEditorialFilter("La recherche obtient un succès historique", 'fr').passes).toBe(true)
  })

  it('descarta guerre, mort, attentat, tué', () => {
    expect(passesEditorialFilter("Attentat dans la capitale après le succès du sommet", 'fr').passes).toBe(false)
    expect(passesEditorialFilter("La guerre continue malgré l'espoir", 'fr').passes).toBe(false)
    expect(passesEditorialFilter("Un homme tué dans la rue", 'fr').passes).toBe(false)
  })

  it('cau "achève" (cas que el filtre v9 va incorporar)', () => {
    expect(passesEditorialFilter("Bolloré achève Prisma, le succès de la presse magazine", 'fr').passes).toBe(false)
  })
})

describe('passesEditorialFilter — comportament general', () => {
  it('és insensible a majúscules', () => {
    expect(passesEditorialFilter("ÈXIT", 'ca').isPositive).toBe(true)
    expect(passesEditorialFilter("èxit", 'ca').isPositive).toBe(true)
  })

  it('si l\'idioma és desconegut, cau al diccionari català', () => {
    const result = passesEditorialFilter("èxit catalanístic", 'xx')
    expect(result.isPositive).toBe(true)
  })
})

describe('looksLikeAdvertorial — per URL', () => {
  it('detecta seccions comercials d\'El País (/escaparate/, /smart/)', () => {
    expect(looksLikeAdvertorial({
      url: 'https://elpais.com/escaparate/2026/06/12/los-mejores-iphones',
      title: 'Notícia qualsevol',
      summary: '',
    })).toBe(true)
    expect(looksLikeAdvertorial({
      url: 'https://elpais.com/smart/articulo-promocional',
      title: 'Notícia',
      summary: '',
    })).toBe(true)
  })

  it('detecta podcasts i sponsored', () => {
    expect(looksLikeAdvertorial({
      url: 'https://www.bloomberg.com/podcasts/episode-123',
      title: 'Qualsevol cosa',
      summary: '',
    })).toBe(true)
    expect(looksLikeAdvertorial({
      url: 'https://example.com/sponsored/brand-x',
      title: 'Qualsevol cosa',
      summary: '',
    })).toBe(true)
  })

  it('no marca URLs editorials normals com a advertorial', () => {
    expect(looksLikeAdvertorial({
      url: 'https://www.3cat.cat/3catinfo/societat/noticia/123',
      title: 'Una història local',
      summary: 'Resum curt',
    })).toBe(false)
  })
})

describe('looksLikeAdvertorial — per patrons de títol', () => {
  it('detecta "Los/Las mejores [X]" i variants catalanes/angleses', () => {
    expect(looksLikeAdvertorial({ url: '', title: 'Los mejores robots de cocina', summary: '' })).toBe(true)
    expect(looksLikeAdvertorial({ url: '', title: 'Las mejores playas para el verano', summary: '' })).toBe(true)
    expect(looksLikeAdvertorial({ url: '', title: 'The best laptops of 2026', summary: '' })).toBe(true)
    expect(looksLikeAdvertorial({ url: '', title: 'Top 10 destinations', summary: '' })).toBe(true)
  })

  it('detecta "N coses/productes" amb verb publicitari', () => {
    expect(looksLikeAdvertorial({ url: '', title: 'Once buenas marcas de legumbres cocidas', summary: '' })).toBe(true)
    expect(looksLikeAdvertorial({ url: '', title: 'Siete aperitivos para hacer en casa', summary: '' })).toBe(true)
  })

  it('detecta opinió signada al final del títol ("..., por Jorge Valdano")', () => {
    expect(looksLikeAdvertorial({ url: '', title: 'La luz épica del estadio Azteca, por Jorge Valdano', summary: '' })).toBe(true)
    expect(looksLikeAdvertorial({ url: '', title: 'Notícia molt seriosa, per Núria Cadenes', summary: '' })).toBe(true)
  })

  it('detecta opinió signada al final del subtítol (no només al títol)', () => {
    expect(looksLikeAdvertorial({
      url: '',
      title: 'Notícia normal sobre cultura',
      summary: 'Una reflexió interessant sobre el present, por Jorge Valdano',
    })).toBe(true)
  })

  it('detecta podcasts Bloomberg "on Strategy/Growth/Alpha"', () => {
    expect(looksLikeAdvertorial({ url: '', title: 'Lenovo on Strategy and Growth', summary: '' })).toBe(true)
    expect(looksLikeAdvertorial({ url: '', title: 'Hedge Funds on Asia Alpha', summary: '' })).toBe(true)
  })

  it('detecta "presenta el nuevo", "lanza al mercado"', () => {
    expect(looksLikeAdvertorial({ url: '', title: 'Bosch presenta el nuevo modelo de lavadora', summary: '' })).toBe(true)
    expect(looksLikeAdvertorial({ url: '', title: 'BMW lanza al mercado el nuevo coupé', summary: '' })).toBe(true)
  })

  it('detecta fitxa tècnica d\'automòbil venuda com a notícia (colat el 07/07)', () => {
    // El Dacia Sandero passava perquè "estrena" és paraula positiva i l'article
    // era indefinit ("estrena UN nou"). El cacem per la fitxa tècnica (potència,
    // consum), sense tocar les estrenes culturals.
    expect(looksLikeAdvertorial({
      url: 'https://exemple.cat/motor/dacia-sandero',
      title: 'Dacia estrena un nou Sandero híbrid per 19.890 euros',
      summary: 'La versió HEV té 155 CV i un consum homologat de 4,2 L/100 Km',
    })).toBe(true)
  })

  it('NO marca com a publi les estrenes culturals amb article indefinit', () => {
    expect(looksLikeAdvertorial({ url: '', title: 'El museu estrena una nova exposició sobre Miró', summary: 'Amb obres inèdites' })).toBe(false)
    expect(looksLikeAdvertorial({ url: '', title: 'El Liceu estrena una nova òpera de Wagner', summary: 'Celebrada per la crítica' })).toBe(false)
    expect(looksLikeAdvertorial({ url: '', title: 'La banda estrena un nou disc', summary: 'Torna als escenaris' })).toBe(false)
  })

  it('detecta Black Friday i Cyber Monday', () => {
    expect(looksLikeAdvertorial({ url: '', title: 'Las ofertas del Black Friday', summary: '' })).toBe(true)
    expect(looksLikeAdvertorial({ url: '', title: 'Best deals on Cyber Monday', summary: '' })).toBe(true)
  })

  it('detecta opulencia esportiva ("precios disparados")', () => {
    expect(looksLikeAdvertorial({
      url: '',
      title: 'El Mundial de la opulencia',
      summary: 'precios disparados para ir a los estadios',
    })).toBe(true)
  })

  it('detecta cotilleo de famosos i sortejos (regression Kanye West / BASES LEGALES)', () => {
    expect(looksLikeAdvertorial({
      url: '',
      title: 'Así ha celebrado Kanye West su 49º cumpleaños: baile de máscaras en Versalles y 400.000 dólares gastados',
      summary: 'El rapero celebró la cita con su pareja, Bianca Censori',
    })).toBe(true)
    expect(looksLikeAdvertorial({ url: '', title: 'BASES LEGALES DEL SORTEO "Entradas para el concierto"', summary: '' })).toBe(true)
  })

  it('detecta clickbait de bellesa/dieta (regression "La celulitis se puede eliminar")', () => {
    expect(looksLikeAdvertorial({
      url: '',
      title: 'La celulitis se puede eliminar',
      summary: 'Nosotros te ayudamos proponiéndote los tratamientos y trucos más efectivos',
    })).toBe(true)
    expect(looksLikeAdvertorial({ url: '', title: 'Trucos para adelgazar este verano', summary: '' })).toBe(true)
    expect(looksLikeAdvertorial({ url: '', title: 'Una crema antiarrugas que rejuvenece', summary: '' })).toBe(true)
  })

  it('no marca notícies editorials normals com a advertorial', () => {
    expect(looksLikeAdvertorial({
      url: '',
      title: 'Un grup de veïns recupera la memòria del barri',
      summary: 'Després de mesos de feina conjunta amb l\'arxiu',
    })).toBe(false)
    expect(looksLikeAdvertorial({
      url: '',
      title: 'Inauguren una nova biblioteca al barri',
      summary: 'Amb fons de 5.000 títols donats per veïns',
    })).toBe(false)
  })
})

describe('applyDiversityCap — sostre per font', () => {
  function story(source, idx) {
    return { url: `https://${source.toLowerCase()}.com/${idx}`, title: `${source} ${idx}`, source }
  }

  it('respecta el sostre per font quan hi ha prou diversitat per arribar al target', () => {
    // 4 d'El País + 4 Vilaweb + 4 ARA = 12, target = 6, max = 2
    // → resultat: 2+2+2 = 6 peces, totes dins del sostre
    const stories = [
      story('El País', 1), story('El País', 2), story('El País', 3), story('El País', 4),
      story('Vilaweb', 1), story('Vilaweb', 2), story('Vilaweb', 3), story('Vilaweb', 4),
      story('ARA', 1), story('ARA', 2), story('ARA', 3), story('ARA', 4),
    ]
    const result = applyDiversityCap(stories, 2, 6)
    expect(result.filter((s) => s.source === 'El País').length).toBe(2)
    expect(result.filter((s) => s.source === 'Vilaweb').length).toBe(2)
    expect(result.filter((s) => s.source === 'ARA').length).toBe(2)
    expect(result.length).toBe(6)
  })

  it('quan el sostre deixaria el lot curt, completa amb overflow (soft cap)', () => {
    // 6 d'El País + 2 Vilaweb + 1 ARA = 9, target 30, max 3
    // → primary 3+2+1 = 6, no arriba a 30, completa amb overflow d'El País
    const stories = [
      story('El País', 1), story('El País', 2), story('El País', 3),
      story('El País', 4), story('El País', 5), story('El País', 6),
      story('Vilaweb', 1), story('Vilaweb', 2), story('ARA', 1),
    ]
    const result = applyDiversityCap(stories, 3, 30)
    expect(result.length).toBe(9)
    // En soft cap, totes les peces hi caben encara que superin el límit.
    expect(result.filter((s) => s.source === 'El País').length).toBe(6)
  })

  it('quan el límit per font deixa el lot massa curt, hi torna overflow per completar', () => {
    const stories = [
      story('El País', 1), story('El País', 2), story('El País', 3),
      story('El País', 4), story('El País', 5),
    ]
    const result = applyDiversityCap(stories, 2, 5)
    // Primer 2 d'El País, després els 3 sobrants
    expect(result.length).toBe(5)
    expect(result.filter((s) => s.source === 'El País').length).toBe(5)
  })

  it('quan hi ha prou diversitat, retorna tot dins del límit', () => {
    const stories = [
      story('A', 1), story('B', 1), story('C', 1), story('D', 1), story('E', 1),
    ]
    const result = applyDiversityCap(stories, 2, 30)
    expect(result.length).toBe(5)
  })

  it('respecta el target total i no torna més peces que el demanat', () => {
    const stories = Array.from({ length: 100 }, (_, i) => story('X', i))
    const result = applyDiversityCap(stories, 5, 30)
    expect(result.length).toBe(30)
  })

  it('gestiona el cas buit sense petar', () => {
    expect(applyDiversityCap([], 5, 30)).toEqual([])
  })
})

describe('normalizeCategory — mapatge a categories canòniques', () => {
  it('normalitza variants ortogràfiques i d\'idioma a la mateixa categoria', () => {
    expect(normalizeCategory('POLíTICA', 'Actualitat')).toBe('Política')
    expect(normalizeCategory('Politics', 'Actualitat')).toBe('Política')
    expect(normalizeCategory('Politique', 'Actualitat')).toBe('Política')
    expect(normalizeCategory('cultura', 'Actualitat')).toBe('Cultura')
    expect(normalizeCategory('Arts', 'Actualitat')).toBe('Cultura')
  })

  it('parteix categories compostes i agafa la primera reconeguda', () => {
    expect(normalizeCategory('ECONOMIA - POLíTICA', 'Actualitat')).toBe('Economia')
    expect(normalizeCategory('Sports/Football', 'Actualitat')).toBe('Esports')
  })

  it('redirigeix països cap a Món o Europa segons toqui', () => {
    expect(normalizeCategory('Reino Unido', 'Actualitat')).toBe('Món')
    expect(normalizeCategory('UE', 'Actualitat')).toBe('Europa')
    expect(normalizeCategory('China', 'Actualitat')).toBe('Món')
  })

  it('etiqueta clarament les peces d\'opinió', () => {
    expect(normalizeCategory('Editorial', 'Actualitat')).toBe('Opinió')
    expect(normalizeCategory('Mail Obert', 'Actualitat')).toBe('Opinió')
    expect(normalizeCategory('Opinion', 'Actualitat')).toBe('Opinió')
  })

  it('cau al fallback quan no troba res', () => {
    expect(normalizeCategory('Barclays', 'Economia')).toBe('Economia')
    expect(normalizeCategory('XYZ inventat', 'Món')).toBe('Món')
    expect(normalizeCategory('', 'Actualitat')).toBe('Actualitat')
    expect(normalizeCategory(null, undefined)).toBe('Actualitat')
  })

  it('canonicalizeCategory retorna null per a coses no reconegudes', () => {
    expect(canonicalizeCategory('Barclays')).toBeNull()
    expect(canonicalizeCategory('Reino Unido')).toBe('Món')
  })
})

describe('feedStoryId — id estable derivat de la URL', () => {
  it('és determinista: la mateixa URL dona sempre el mateix id', () => {
    const url = 'https://www.3cat.cat/noticia/12345/'
    expect(feedStoryId(url)).toBe(feedStoryId(url))
  })

  it('dona ids diferents per a URLs diferents', () => {
    expect(feedStoryId('https://a.com/1')).not.toBe(feedStoryId('https://a.com/2'))
  })

  it('sempre comença per "feed-"', () => {
    expect(feedStoryId('https://x.com/y')).toMatch(/^feed-/)
  })
})

describe('injectStoryMeta — meta socials per notícia', () => {
  const baseHtml = `<!doctype html><html><head>
<title>El Bon Diari | Bones notícies</title>
<meta property="og:title" content="El Bon Diari | Bones notícies" />
<meta property="og:description" content="generic" />
<meta property="og:image" content="https://bondiari.com/og-image.png" />
<meta name="twitter:image" content="https://bondiari.com/og-image.png" />
</head><body></body></html>`

  const story = {
    title: 'Inauguren una biblioteca al barri',
    summary: 'Amb fons de 5.000 títols donats per veïns.',
    imageUrl: 'https://img.beteve.cat/foto.jpg',
  }

  it('posa el títol de la notícia a og:title i <title>', () => {
    const out = injectStoryMeta(baseHtml, story, 'https://bondiari.com/noticia/x')
    expect(out).toContain('<meta property="og:title" content="Inauguren una biblioteca al barri · El Bon Diari" />')
    expect(out).toContain('<title>Inauguren una biblioteca al barri · El Bon Diari</title>')
  })

  it('posa la imatge de la notícia a og:image i twitter:image', () => {
    const out = injectStoryMeta(baseHtml, story, 'https://bondiari.com/noticia/x')
    expect(out).toContain('<meta property="og:image" content="https://img.beteve.cat/foto.jpg" />')
    expect(out).toContain('<meta name="twitter:image" content="https://img.beteve.cat/foto.jpg" />')
  })

  it('escapa cometes i símbols del títol per no trencar l\'atribut', () => {
    const tricky = { title: 'L\'"èxit" <gran> & clar', summary: 'x', imageUrl: 'https://i/x.jpg' }
    const out = injectStoryMeta(baseHtml, tricky, 'https://bondiari.com/noticia/x')
    expect(out).toContain('&quot;')
    expect(out).toContain('&lt;gran&gt;')
    expect(out).toContain('&amp;')
  })
})

describe('social — composició del post', () => {
  const story = {
    title: 'Inauguren una biblioteca al barri',
    summary: 'Amb fons de 5.000 títols.',
    source: 'Betevé',
    url: 'https://beteve.cat/noticia/123',
  }

  it('storyLink apunta a bondiari.com/noticia/:id, no a la font', () => {
    const link = storyLink(story)
    expect(link).toMatch(/^https:\/\/bondiari\.com\/noticia\/feed-/)
    expect(link).not.toContain('beteve.cat')
  })

  it('el text inclou el títol i el crèdit de la font', () => {
    const text = composePostText(story, 240)
    expect(text).toContain('Inauguren una biblioteca al barri')
    expect(text).toContain('(via Betevé)')
  })

  it('trunca el títol llarg per no passar-se del límit', () => {
    const longStory = { ...story, title: 'A'.repeat(300), source: 'X' }
    const text = composePostText(longStory, 240)
    expect(text.length).toBeLessThanOrEqual(240)
    expect(text.endsWith('(via X)')).toBe(true)
  })
})

describe('gent que treballa pels altres', () => {
  const entra = (text, lang = 'ca') => {
    const baixa =
      UNIVERSAL_NEG.test(text.toLowerCase()) ||
      POLITICAL_MARKERS.test(text.toLowerCase())
    return passesEditorialFilter(text, lang).passes && !baixa
  }

  // El diccionari sabia dir "premi", "inaugura" o "descobreix" i no tenia CAP
  // paraula per a rescatar, cooperar o apadrinar: "Open Arms rescata 200
  // persones" no el bloquejava ningú, però tampoc el reconeixia ningú.
  it('reconeix el rescat, la cooperació i el voluntariat', () => {
    for (const t of [
      'Open Arms rescata 200 persones al Mediterrani central',
      'Els bombers i voluntaris rescaten sis excursionistes al Montseny',
      'Un metge cooperant català torna del Txad',
      'Creix el nombre de donants de sang a Catalunya',
      'Una família de Vic apadrina un infant saharaui',
      'Una missió humanitària parteix cap al Sudan',
    ]) {
      expect(entra(t), t).toBe(true)
    }
    expect(entra('Open Arms rescata a 200 personas en el Mediterráneo', 'es')).toBe(true)
    expect(entra('Volunteers rescued forty people from the floods', 'en')).toBe(true)
  })

  // Només ACCIONS, no marcadors de tema. Provat el 27/07/2026: "acull" feia
  // bona notícia de qualsevol congrés o final esportiva, i el nom d'una ONG
  // convertia en bona notícia la seva pròpia denúncia. Un nom d'ONG diu de què
  // va la peça, no si és bona: queda neutra i la valora la IA.
  it('no confon acollir un congrés ni el nom d’una ONG amb una bona notícia', () => {
    for (const t of [
      'Barcelona acull el Congrés Mundial de Mòbils',
      "L'Estadi Olímpic acull la final de la Champions",
      "La Creu Roja alerta de l'augment de la pobresa infantil",
      "Càritas denuncia l'increment de la desigualtat",
    ]) {
      expect(entra(t), t).toBe(false)
    }
  })
})
