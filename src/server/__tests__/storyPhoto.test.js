// Proves del pilot de fotos reals (Wikimedia Commons) per a Agenda i Local.

import { describe, it, expect } from 'vitest'
import {
  extractPlace,
  isPlacePhotoEligible,
  buildCommonsSearchUrl,
  pickBestCommonsPhoto,
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
    expect(photo.source).toBe('wikimedia-commons')
  })

  it('rebutja fitxers que no són JPEG (SVG, PNG de mapes…)', () => {
    const response = commonsResponse([photoPage('File:Panorama.svg')])
    expect(pickBestCommonsPhoto(response, 'lloc')).toBeNull()
  })

  it('retorna null si no hi ha resultats', () => {
    expect(pickBestCommonsPhoto({ query: { pages: {} } }, 'lloc')).toBeNull()
    expect(pickBestCommonsPhoto(null, 'lloc')).toBeNull()
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
})
