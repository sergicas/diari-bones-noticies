// Proves del pilot de fotos reals (Wikimedia Commons) per a Agenda i Local.

import { describe, it, expect } from 'vitest'
import {
  extractPlace,
  buildCommonsSearchUrl,
  pickBestCommonsPhoto,
  attachRealPhotos,
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
  const agendaStory = (title) => ({
    category: 'Agenda',
    title,
    location: 'Mataró, Maresme',
    imageUrl: '/api/story-image/feed-abc?s=x',
  })

  it('posa foto, crèdit i alt a una peça d’Agenda amb lloc', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => commonsResponse([photoPage('File:Mataró port.jpg')]),
    })
    const stories = [agendaStory('Festival al port de Mataró')]
    const found = await attachRealPhotos(stories, { fetchFn })
    expect(found).toBe(1)
    expect(stories[0].imageUrl).toContain('upload.wikimedia.org')
    expect(stories[0].imageCredit).toContain('Joana Fotògrafa')
    expect(stories[0].imageCredit).toContain('Wikimedia Commons')
    expect(stories[0].photoChecked).toBe(true)
  })

  it('si Commons no troba res, conserva el dibuix i marca la peça com mirada', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => commonsResponse([]) })
    const stories = [agendaStory('Concert de tardor')]
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
    const checked = { ...agendaStory('Fira d’Argentona'), photoChecked: true }
    const fresh = Array.from({ length: 12 }, (_, i) => agendaStory(`Fira ${i} de Mataró`))
    await attachRealPhotos([checked, ...fresh], { fetchFn, maxLookups: 3 })
    expect(calls).toBe(3)
  })

  it('funciona per a qualsevol secció si la peça té un lloc concret', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => commonsResponse([photoPage('File:Girona catedral.jpg')]),
    })
    const stories = [
      { category: 'Cultura', title: 'Nou museu d’art contemporani', location: 'Girona, Gironès' },
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
        title: 'Òrrius celebra la festa',
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
})
