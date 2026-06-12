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
