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
} from '../liveNews.js'
import { normalizeCategory, canonicalizeCategory } from '../../lib/category.js'
import { feedStoryId } from '../../lib/story-id.js'
import { injectStoryMeta } from '../storyMeta.js'
import { composePostText, storyLink } from '../social.js'

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

  it('descarta el mateix terme en majúscules i minúscules', () => {
    expect(passesEditorialFilter("LOGRA EL ÉXITO HISTÓRICO", 'es').passes).toBe(true)
    expect(passesEditorialFilter("ASESINATO EN PLENA CALLE TRAS LOGRO HISTÓRICO", 'es').passes).toBe(false)
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
