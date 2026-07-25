import { describe, it, expect } from 'vitest'
import { fallbackSvg, wrapTitle } from '../storyImage.js'
import { storyImagePath } from '../../lib/story-image-path.js'

const cover = (opts) => fallbackSvg({ seed: 'a quiet street scene', ...opts })

describe('wrapTitle', () => {
  it('parteix el titular respectant el màxim de línies', () => {
    const lines = wrapTitle('Una paraula darrere una altra fins que no hi cap res més', 44, 720, 4)
    expect(lines.length).toBeLessThanOrEqual(4)
    expect(lines.join(' ')).toContain('Una paraula')
  })

  it('retalla amb punts suspensius quan el titular no hi cap', () => {
    const llarg = 'Paraula '.repeat(60).trim()
    const lines = wrapTitle(llarg, 44, 720, 4)
    expect(lines).toHaveLength(4)
    expect(lines[3].endsWith('…')).toBe(true)
  })

  it('parteix una paraula més llarga que la línia en comptes de desbordar', () => {
    const maxChars = Math.floor(720 / (44 * 0.52))
    const lines = wrapTitle('A'.repeat(200), 44, 720, 4)
    lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(maxChars))
  })

  it('no peta amb valors buits', () => {
    expect(wrapTitle('', 44, 720, 4)).toEqual([])
    expect(wrapTitle(null, 44, 720, 4)).toEqual([])
    expect(wrapTitle(undefined, 44, 720, 4)).toEqual([])
  })
})

describe('fallbackSvg', () => {
  it('compon el titular i la categoria dins la portada', () => {
    const svg = cover({ category: 'Cultura', title: 'The Tyets prepara un gran concert' })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).toContain('CULTURA')
    expect(svg).toContain('The Tyets prepara')
    expect(svg).toContain('#146356') // verd de marca
    expect(svg).toContain('#FFE000') // groc de la secció Cultura
  })

  it('dona portades DIFERENTS a notícies diferents (el bug de les 19 iguals)', () => {
    const a = cover({ category: 'Cultura', title: 'Primera notícia del dia' })
    const b = cover({ category: 'Cultura', title: 'Segona notícia del dia' })
    const c = cover({ category: 'Salut', title: 'Primera notícia del dia' })
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })

  it('és determinista: la mateixa peça dona sempre la mateixa portada', () => {
    const args = { category: 'Societat', title: 'Lyona recorda la seva estada a la Sénia' }
    expect(cover(args)).toBe(cover(args))
  })

  it('neteja i escapa els caràcters que trencarien l’XML', () => {
    const svg = cover({ category: 'Verificació', title: 'Tren <inventat> & "fals"' })
    // sanitizeSeed ja treu < > " del titular; l'ampersand arriba i s'escapa.
    expect(svg).toContain('&amp;')
    expect(svg).toContain('inventat')
    expect(svg).not.toContain('<inventat')
    // El document no ha de tenir cap etiqueta inventada pel titular.
    const etiquetes = svg.match(/<[a-zA-Z/][^>]*>/g) || []
    const permeses = /^<\/?(svg|title|defs|linearGradient|stop|rect|circle|text|tspan)[\s/>]/
    etiquetes.forEach((tag) => expect(tag).toMatch(permeses))
  })

  it('no imprimeix mai el brief en anglès de la IA', () => {
    const svg = fallbackSvg({ seed: 'a vintage television set in a living room', category: 'Cultura', title: 'La sèrie Dallas i el seu impacte a TV3' })
    expect(svg).not.toContain('vintage television')
    expect(svg).toContain('Dallas')
  })

  it('accepta el format llegat categoria|títol', () => {
    const svg = fallbackSvg({ seed: 'Salut|Un avenç contra la leucèmia infantil' })
    expect(svg).toContain('SALUT')
    expect(svg).toContain('leucèmia infantil')
  })

  it('aguanta una peça sense categoria ni titular', () => {
    const svg = fallbackSvg({ seed: '' })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('BONA NOTÍCIA')
  })
})

describe('storyImagePath', () => {
  it('porta sempre categoria i titular perquè la reserva els pugui compondre', () => {
    const path = storyImagePath('https://exemple.cat/noticia', {
      title: 'Un titular qualsevol',
      category: 'Medi ambient',
      brief: 'a river running through a green valley',
    })
    const params = new URLSearchParams(path.split('?')[1])
    expect(path.startsWith('/api/story-image/feed-')).toBe(true)
    expect(params.get('s')).toBe('a river running through a green valley')
    expect(params.get('c')).toBe('Medi ambient')
    expect(params.get('t')).toBe('Un titular qualsevol')
  })

  it('manté el seed llegat quan no hi ha brief', () => {
    const path = storyImagePath('https://exemple.cat/noticia', {
      title: 'Un titular qualsevol',
      category: 'Salut',
    })
    expect(new URLSearchParams(path.split('?')[1]).get('s')).toBe('Salut|Un titular qualsevol')
  })
})
