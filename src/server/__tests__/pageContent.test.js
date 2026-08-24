import { describe, expect, it } from 'vitest'
import {
  renderContentPage,
  injectBodyIntoRoot,
  buildTopicsIndex,
  storyLinkId,
} from '../pageContent.js'
import { feedStoryId } from '../../lib/story-id.js'
import { EDITORIAL_TOPIC_INDEX } from '../../lib/category.js'

const TEMPLATE =
  '<!doctype html><html lang="ca"><head><title>plantilla</title></head>' +
  '<body><div id="root"></div><script src="/x.js"></script></body></html>'

function makeEnv({ latest = null } = {}) {
  return {
    ASSETS: {
      fetch: async () =>
        new Response(TEMPLATE, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    },
    LIVE_NEWS_KV: {
      get: async (key) => (key === 'latest' ? latest : null),
    },
    // Sense EDITORIAL_DB: readEditorialStoryCatalog retorna stories buides i el
    // codi tira de les peces llavor. Així les proves no depenen de D1.
  }
}

function req(path) {
  return new Request(`https://bondiari.com${path}`)
}

describe('storyLinkId', () => {
  it('fa servir el slug propi de les peces llavor', () => {
    expect(storyLinkId({ id: 'el-prat-101', url: 'https://x/a' })).toBe('el-prat-101')
  })
  it('deriva l’id de la URL quan la peça no en té (radar/hemeroteca)', () => {
    const url = 'https://exemple.cat/noticia-bona'
    expect(storyLinkId({ url })).toBe(feedStoryId(url))
  })
})

describe('injectBodyIntoRoot', () => {
  it('reemplaça el #root buit i deixa la resta igual', () => {
    const out = injectBodyIntoRoot(TEMPLATE, '<main>hola</main>')
    expect(out).toContain('<div id="root"><main>hola</main></div>')
    expect(out).toContain('<script src="/x.js"></script>')
  })
})

describe('buildTopicsIndex', () => {
  it('llista tots els temes editorials amb enllaç propi', () => {
    const html = buildTopicsIndex()
    for (const topic of EDITORIAL_TOPIC_INDEX) {
      expect(html).toContain(`/tema/${topic.id}`)
      expect(html).toContain(topic.label)
    }
  })
})

describe('renderContentPage', () => {
  it('injecta contingut real a la portada (amb peces llavor)', async () => {
    const res = await renderContentPage(req('/'), makeEnv())
    expect(res).not.toBeNull()
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).not.toContain('<div id="root"></div>')
    expect(html).toContain('<main class="ssr-content">')
    expect(html).toContain('Periodisme constructiu')
    expect(html).toContain('/noticia/') // enllaços interns cap als articles
  })

  it('mostra les peces vives del radar quan n’hi ha', async () => {
    const latest = {
      stories: [
        {
          title: 'Una molt bona notícia de prova',
          url: 'https://exemple.cat/peca-viva',
          summary: 'Resum verificable de la peça.',
          category: 'Societat',
        },
      ],
    }
    const res = await renderContentPage(req('/'), makeEnv({ latest }))
    const html = await res.text()
    expect(html).toContain('Una molt bona notícia de prova')
    expect(html).toContain(`/noticia/${feedStoryId('https://exemple.cat/peca-viva')}`)
  })

  it('serveix el text estàtic de /sobre', async () => {
    const res = await renderContentPage(req('/sobre'), makeEnv())
    const html = await res.text()
    expect(html).toContain('El Bon Diari és un diari editorial petit i obert.')
    expect(html).toContain('Creative Commons')
  })

  it('serveix una pàgina de tema vàlida', async () => {
    const res = await renderContentPage(req('/tema/filosofia'), makeEnv())
    expect(res).not.toBeNull()
    const html = await res.text()
    expect(html).toContain('Filosofia')
    expect(html).toContain('<main class="ssr-content">')
  })

  it('retorna null per a una ruta que no gestiona', async () => {
    const res = await renderContentPage(req('/qualsevol-cosa-rara'), makeEnv())
    expect(res).toBeNull()
  })

  it('retorna null (i deixa passar el fallback) si el template no té #root buit', async () => {
    const env = makeEnv()
    env.ASSETS.fetch = async () =>
      new Response('<html><body><div id="root"><p>ja ple</p></div></body></html>', {
        status: 200,
      })
    const res = await renderContentPage(req('/'), env)
    expect(res).toBeNull()
  })

  it('ignora peticions que no són GET/HEAD', async () => {
    const res = await renderContentPage(
      new Request('https://bondiari.com/', { method: 'POST' }),
      makeEnv(),
    )
    expect(res).toBeNull()
  })
})
