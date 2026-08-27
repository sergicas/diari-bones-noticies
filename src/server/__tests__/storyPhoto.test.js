// Proves del pilot de fotos reals (Wikimedia Commons) per a Agenda i Local.

import { describe, it, expect } from 'vitest'
import {
  PHOTO_SEARCH_VERSION,
  extractPlace,
  isPlacePhotoEligible,
  thematicPhotoRuleFor,
  buildCommonsSearchUrl,
  pickBestCommonsPhoto,
  buildNasaSearchUrl,
  pickBestNasaPhoto,
  attachRealPhotos,
  sanitizeStoryPhoto,
} from '../storyPhoto.js'

function commonsResponse(pages) {
  return { query: { pages: Object.fromEntries(pages.map((p, i) => [String(i), p])) } }
}

function photoPage(title, overrides = {}) {
  return {
    index: 1,
    title,
    imageinfo: [
      {
        thumburl: `https://upload.wikimedia.org/thumb/${encodeURIComponent(title)}`,
        url: `https://upload.wikimedia.org/${encodeURIComponent(title)}`,
        descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
        extmetadata: {
          Artist: { value: '<a href="#">Joana Fotògrafa</a>' },
          LicenseShortName: { value: 'CC BY-SA 4.0' },
        },
        ...overrides,
      },
    ],
  }
}

function nasaResponse(items) {
  return { collection: { items } }
}

function nasaPhoto(overrides = {}) {
  return {
    data: [
      {
        nasa_id: 'NHQ202404080308',
        title: 'Total solar eclipse above Indianapolis',
        description: 'The Moon passes in front of the Sun during a total solar eclipse.',
        photographer: 'Bill Ingalls',
        keywords: ['solar eclipse', 'Sun', 'Moon'],
        ...overrides,
      },
    ],
    links: [
      {
        render: 'image',
        href: 'https://images-assets.nasa.gov/image/NHQ202404080308/NHQ202404080308~thumb.jpg',
      },
    ],
  }
}

describe('extractPlace', () => {
  it('troba el poble al títol encara que la location sigui genèrica', () => {
    const story = {
      title: 'Argentona estrena el festival de titelles',
      location: 'Catalunya',
    }
    expect(extractPlace(story)).toBe('argentona')
  })

  it('cau a la location quan el títol no porta topònim', () => {
    const story = {
      title: 'Nova exposició de fotografia analògica',
      location: 'Mataró, Maresme',
    }
    expect(extractPlace(story)).toBe('mataró')
  })

  it('accepta un topònim propi fora de la llista si no és genèric', () => {
    const story = { title: 'Obren la piscina municipal', location: 'Granollers, Vallès Oriental' }
    expect(extractPlace(story)).toBe('Granollers')
  })

  it('rebutja llocs genèrics (Món, Catalunya, Barcelona)', () => {
    expect(extractPlace({ title: 'Bona notícia global', location: 'Món' })).toBeNull()
    expect(extractPlace({ title: 'Cap topònim aquí', location: 'Barcelona' })).toBeNull()
  })
})

describe('isPlacePhotoEligible', () => {
  it('rebutja el cas real dels festivals d’Arenys encara que detecti el municipi', () => {
    const story = {
      title: 'Arenys de Mar acull dos festivals de música aquest estiu',
      category: 'Cultura',
      location: 'Món',
    }
    expect(extractPlace(story)).toBe('arenys de mar')
    expect(isPlacePhotoEligible(story)).toBe(false)
  })

  it('rebutja qualsevol peça d’Agenda', () => {
    expect(
      isPlacePhotoEligible({
        title: 'Proposta de cap de setmana a Mataró',
        category: 'Agenda',
        location: 'Mataró, Maresme',
      }),
    ).toBe(false)
  })

  it('rebutja fotos geogràfiques ambigües per a dades oficials', () => {
    expect(
      isPlacePhotoEligible({
        title: "Idescat actualitza Construcció d'habitatges a Mataró",
        category: 'Dades',
        editorialFormat: 'data',
        location: 'Mataró, Maresme',
      }),
    ).toBe(false)
  })

  it('admet una peça realment centrada en el territori', () => {
    expect(
      isPlacePhotoEligible({
        title: 'Mataró renaturalitza un tram de la riera',
        category: 'Medi ambient',
        location: 'Mataró, Maresme',
      }),
    ).toBe(true)
  })
})

describe('buildCommonsSearchUrl', () => {
  it('cerca només fitxers de mapa de bits al namespace de fitxers', () => {
    const url = buildCommonsSearchUrl('argentona')
    expect(url).toContain('commons.wikimedia.org')
    expect(url).toContain('gsrnamespace=6')
    expect(url).toContain('filetype%3Abitmap+argentona')
    expect(url).toContain('iiurlwidth=1200')
  })
})

describe('pickBestCommonsPhoto', () => {
  it('salta escuts, mapes i logos i tria la primera foto JPEG', () => {
    const response = commonsResponse([
      { ...photoPage('File:Escut d’Argentona.jpg'), index: 0 },
      { ...photoPage('File:Mapa de la comarca.jpg'), index: 1 },
      { ...photoPage('File:Argentona plaça nova.jpg'), index: 2 },
    ])
    const photo = pickBestCommonsPhoto(response, 'argentona')
    expect(photo).not.toBeNull()
    expect(photo.url).toContain('pla%C3%A7a%20nova')
    expect(photo.author).toBe('Joana Fotògrafa')
    expect(photo.license).toBe('CC BY-SA 4.0')
    expect(photo.sourceUrl).toContain('commons.wikimedia.org')
    expect(photo.source).toBe('wikimedia-commons')
  })

  it('rebutja fitxers que no són JPEG (SVG, PNG de mapes…)', () => {
    const response = commonsResponse([photoPage('File:Panorama.svg')])
    expect(pickBestCommonsPhoto(response, 'lloc')).toBeNull()
  })

  it('rebutja una foto lliure si no coincideix amb el tema demanat', () => {
    const response = commonsResponse([photoPage('File:Mountain landscape.jpg')])
    expect(
      pickBestCommonsPhoto(response, 'wetland', {
        kind: 'topic',
        requiredTerms: ['wetland'],
      }),
    ).toBeNull()
  })

  it('retorna null si no hi ha resultats', () => {
    expect(pickBestCommonsPhoto({ query: { pages: {} } }, 'lloc')).toBeNull()
    expect(pickBestCommonsPhoto(null, 'lloc')).toBeNull()
  })
})

describe('fotografia temàtica institucional', () => {
  const eclipseStory = {
    title: "La NASA estudia l'eclipsi solar per desvetllar la corona solar",
    category: 'Ciència',
    location: 'Europa',
    source: 'Phys.org',
    body: ['La Lluna projecta la seva ombra durant un eclipsi total.'],
    imageUrl: '/api/story-image/feed-eclipse?s=x',
  }

  it('reconeix només temes visuals explícitament admesos', () => {
    expect(thematicPhotoRuleFor(eclipseStory)?.query).toBe('solar eclipse')
    expect(
      thematicPhotoRuleFor({
        title: "Els pares influeixen en l'evolució dels seus fills, mostren experiments amb escarabats",
        category: 'Ciència',
      })?.query,
    ).toBe('beetle insect')
    expect(
      thematicPhotoRuleFor({
        title: 'Dogs blink more often when seeing owners blink',
        category: 'Ciència',
      })?.query,
    ).toBe('domestic dog')
    expect(
      thematicPhotoRuleFor({ title: 'Una nova teoria filosòfica', category: 'Cultura' }),
    ).toBeNull()
  })

  it('construeix una consulta només d’imatges a la biblioteca oficial de NASA', () => {
    const url = buildNasaSearchUrl('solar eclipse')
    expect(url).toContain('images-api.nasa.gov/search')
    expect(url).toContain('q=solar+eclipse')
    expect(url).toContain('media_type=image')
    expect(url).toContain('page_size=10')
  })

  it('rebutja material de tercers amb copyright i conserva un resultat NASA', () => {
    const rule = thematicPhotoRuleFor(eclipseStory)
    const photo = pickBestNasaPhoto(
      nasaResponse([
        nasaPhoto({ copyright: 'Third-party photographer' }),
        nasaPhoto(),
      ]),
      rule,
    )
    expect(photo).toMatchObject({
      source: 'nasa-images',
      license: 'Public domain (NASA)',
      topic: 'solar eclipse',
    })
    expect(photo.sourceUrl).toContain('images.nasa.gov/details/')
    expect(photo.licenseProofUrl).toContain('nasa.gov/nasa-brand-center')
  })

  it('substitueix el dibuix per una foto NASA amb drets i crèdit verificables', async () => {
    const stories = [{ ...eclipseStory, photoChecked: true }]
    const found = await attachRealPhotos(stories, {
      fetchFn: async (url) => {
        expect(url).toContain('images-api.nasa.gov')
        return { ok: true, json: async () => nasaResponse([nasaPhoto()]) }
      },
    })

    expect(found).toBe(1)
    expect(stories[0].imageUrl).toContain('images-assets.nasa.gov')
    expect(stories[0].imageCredit).toContain('NASA Image and Video Library')
    expect(stories[0].imageCredit).toContain('imatge d’arxiu')
    expect(stories[0].imageAttributionUrl).toContain('images.nasa.gov/details/')
    expect(stories[0].imageRights).toEqual({
      verified: true,
      license: 'Public domain (NASA)',
      proofUrl: expect.stringContaining('nasa.gov/nasa-brand-center'),
    })
    expect(stories[0].photoSearchVersion).toBe(PHOTO_SEARCH_VERSION)
  })

  it('no repeteix una cerca temàtica ja completada amb la política actual', async () => {
    let calls = 0
    const stories = [
      {
        ...eclipseStory,
        photoChecked: true,
        photoSearchVersion: PHOTO_SEARCH_VERSION,
      },
    ]
    await attachRealPhotos(stories, {
      fetchFn: async () => {
        calls += 1
        return { ok: true, json: async () => nasaResponse([nasaPhoto()]) }
      },
    })
    expect(calls).toBe(0)
    expect(stories[0].imageUrl).toContain('/api/story-image/')
  })

  it('usa Commons per a un tema natural concret i el presenta com a arxiu', async () => {
    const stories = [
      {
        title: 'Uns aiguamolls es recuperen i tornen a acollir fauna',
        category: 'Medi ambient',
        location: 'Món',
        imageUrl: '/api/story-image/feed-wetland?s=x',
      },
    ]
    const found = await attachRealPhotos(stories, {
      fetchFn: async (url) => {
        expect(url).toContain('commons.wikimedia.org')
        expect(url).toContain('wetland')
        return {
          ok: true,
          json: async () => commonsResponse([photoPage('File:Restored wetland.jpg')]),
        }
      },
    })
    expect(found).toBe(1)
    expect(stories[0].imageUrl).toContain('upload.wikimedia.org')
    expect(stories[0].imageCredit).toContain('imatge d’arxiu del tema')
    expect(stories[0].photo.kind).toBe('topic')
  })
})

describe('attachRealPhotos', () => {
  const placeStory = (title) => ({
    category: 'Local',
    title,
    location: 'Mataró, Maresme',
    imageUrl: '/api/story-image/feed-abc?s=x',
  })

  it('posa foto, crèdit i alt a una peça centrada en un lloc', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => commonsResponse([photoPage('File:Mataró port.jpg')]),
    })
    const stories = [placeStory('Mataró recupera el mirador del port')]
    const found = await attachRealPhotos(stories, { fetchFn })
    expect(found).toBe(1)
    expect(stories[0].imageUrl).toContain('upload.wikimedia.org')
    expect(stories[0].imageCredit).toContain('Joana Fotògrafa')
    expect(stories[0].imageCredit).toContain('Wikimedia Commons')
    expect(stories[0].imageRights).toEqual({
      verified: true,
      license: 'CC BY-SA 4.0',
      proofUrl: expect.stringContaining('commons.wikimedia.org'),
    })
    expect(stories[0].photoChecked).toBe(true)
  })

  it('si Commons no troba res, conserva el dibuix i marca la peça com mirada', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => commonsResponse([]) })
    const stories = [placeStory('Mataró recupera un camí de ronda')]
    const found = await attachRealPhotos(stories, { fetchFn })
    expect(found).toBe(0)
    expect(stories[0].imageUrl).toBe('/api/story-image/feed-abc?s=x')
    expect(stories[0].photoChecked).toBe(true)
  })

  it('no repeteix la cerca de peces ja mirades ni passa del sostre', async () => {
    let calls = 0
    const fetchFn = async () => {
      calls += 1
      return { ok: true, json: async () => commonsResponse([]) }
    }
    const checked = { ...placeStory('Mataró amplia el parc'), photoChecked: true }
    const fresh = Array.from(
      { length: 12 },
      (_, i) => placeStory(`Mataró recupera l’espai verd número ${i}`),
    )
    await attachRealPhotos([checked, ...fresh], { fetchFn, maxLookups: 3 })
    expect(calls).toBe(3)
  })

  it('funciona per a qualsevol secció si la peça té un lloc concret', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => commonsResponse([photoPage('File:Girona catedral.jpg')]),
    })
    const stories = [
      {
        category: 'Medi ambient',
        title: 'Girona amplia el bosc urbà',
        location: 'Girona, Gironès',
      },
    ]
    const found = await attachRealPhotos(stories, { fetchFn })
    expect(found).toBe(1)
    expect(stories[0].imageUrl).toContain('upload.wikimedia.org')
  })

  it('reaplica la foto d’una peça arrossegada quan l’enriquiment l’ha esborrada', async () => {
    let calls = 0
    const fetchFn = async () => {
      calls += 1
      return { ok: true, json: async () => commonsResponse([]) }
    }
    const stories = [
      {
        category: 'Local',
        title: 'Òrrius recupera el camí de la font',
        location: 'Òrrius',
        photoChecked: true,
        photo: {
          url: 'https://upload.wikimedia.org/foto-orrius.jpg',
          author: 'Isidre blanc',
          license: 'CC BY-SA 4.0',
          sourceUrl: 'https://commons.wikimedia.org/wiki/File:Foto_Orrius.jpg',
          place: 'òrrius',
          source: 'wikimedia-commons',
        },
        // L'enriquiment del refresc ha tornat a posar el dibuix:
        imageUrl: '/api/story-image/feed-abc?s=x',
        imageCredit: 'El Bon Diari (il·lustració IA)',
      },
    ]
    await attachRealPhotos(stories, { fetchFn })
    expect(calls).toBe(0)
    expect(stories[0].imageUrl).toBe('https://upload.wikimedia.org/foto-orrius.jpg')
    expect(stories[0].imageCredit).toContain('Isidre blanc')
  })

  it('retira la foto antiga del cas d’Arenys i conserva la il·lustració pròpia', async () => {
    let calls = 0
    const stories = [
      {
        category: 'Cultura',
        title: 'Arenys de Mar acull dos festivals de música aquest estiu',
        location: 'Món',
        url: 'https://capgros.elnacional.cat/ca/enjoy/noticia',
        photo: {
          url: 'https://upload.wikimedia.org/paisatge-arenys.jpg',
          author: 'Autor',
          license: 'Public domain',
          place: 'arenys de mar',
          source: 'wikimedia-commons',
        },
        imageUrl: 'https://upload.wikimedia.org/paisatge-arenys.jpg',
        imageCredit: 'Foto: Autor · Wikimedia Commons',
      },
    ]

    const found = await attachRealPhotos(stories, {
      fetchFn: async () => {
        calls += 1
        return { ok: true, json: async () => commonsResponse([]) }
      },
    })

    expect(found).toBe(0)
    expect(calls).toBe(0)
    expect(stories[0].photo).toBeUndefined()
    expect(stories[0].imageUrl).toMatch(/^\/api\/story-image\//)
    expect(stories[0].imageCredit).toBe('El Bon Diari (il·lustració IA)')
    expect(stories[0].photoChecked).toBe(true)
  })

  it('el sanejament és idempotent quan la peça ja té la il·lustració pròpia', () => {
    const story = {
      category: 'Agenda',
      title: 'Concert de jazz a Arenys de Mar',
      location: 'Arenys de Mar',
      url: 'https://exemple.cat/concert',
      imageUrl: '/api/story-image/feed-abc?s=x',
    }
    expect(sanitizeStoryPhoto(story)).toBe(story)
    expect(story.imageUrl).toBe('/api/story-image/feed-abc?s=x')
  })

  it('sense lloc concret no cerca res i la peça conserva el dibuix', async () => {
    let calls = 0
    const fetchFn = async () => {
      calls += 1
      return { ok: true, json: async () => commonsResponse([]) }
    }
    const stories = [
      { category: 'Ciència', title: 'Descoberta astronòmica', location: 'Món' },
    ]
    const found = await attachRealPhotos(stories, { fetchFn })
    expect(calls).toBe(0)
    expect(found).toBe(0)
    expect(stories[0].photoChecked).toBe(true)
  })

  it('retira una foto ambigua ja guardada d’una peça de dades', () => {
    const story = {
      title: "Idescat actualitza Construcció d'habitatges a Mataró",
      category: 'Dades',
      editorialFormat: 'data',
      location: 'Mataró, Maresme',
      url: 'https://www.idescat.cat/dada',
      photo: {
        url: 'https://upload.wikimedia.org/locomotora-mataro.jpg',
        author: 'Autor',
        license: 'Public domain',
        place: 'mataró',
        source: 'wikimedia-commons',
      },
      imageUrl: 'https://upload.wikimedia.org/locomotora-mataro.jpg',
    }

    sanitizeStoryPhoto(story)

    expect(story.photo).toBeUndefined()
    expect(story.imageUrl).toContain('/api/story-image/')
    expect(story.imageCredit).toBe('El Bon Diari (il·lustració IA)')
  })

  it('substitueix qualsevol foto externa sense prova de llicència per la il·lustració pròpia', () => {
    const story = {
      title: 'Una peça amb una foto sense llicència comprovable',
      category: 'Ciència',
      location: 'Món',
      url: 'https://exemple.cat/foto-sense-drets',
      imageUrl: 'https://exemple.cat/foto.jpg',
      imageCredit: 'Un crèdit no és una llicència',
    }

    sanitizeStoryPhoto(story)

    expect(story.imageUrl).toMatch(/^\/api\/story-image\//)
    expect(story.imageCredit).toBe('El Bon Diari (il·lustració IA)')
    expect(story.imageRights).toBeUndefined()
  })

  it('conserva una foto externa amb llicència lliure i URL de prova', () => {
    const story = {
      title: 'Una peça amb fotografia lliure',
      category: 'Ciència',
      location: 'Món',
      url: 'https://exemple.cat/foto-lliure',
      imageUrl: 'https://upload.wikimedia.org/foto-lliure.jpg',
      imageRights: {
        verified: true,
        license: 'CC BY 4.0',
        proofUrl: 'https://commons.wikimedia.org/wiki/File:Foto_lliure.jpg',
      },
    }

    sanitizeStoryPhoto(story)

    expect(story.imageUrl).toBe('https://upload.wikimedia.org/foto-lliure.jpg')
  })
})
