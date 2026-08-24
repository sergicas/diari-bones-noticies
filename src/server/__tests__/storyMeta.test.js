import { describe, expect, it } from 'vitest'
import { renderStoryPage } from '../storyMeta.js'

const TEMPLATE =
  '<!doctype html><html lang="ca"><head><title>plantilla</title>' +
  '<link rel="canonical" href="https://bondiari.com/" /></head>' +
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
  }
}

function req(path) {
  return new Request(`https://bondiari.com${path}`)
}

describe('renderStoryPage', () => {
  it('retorna null per a rutes que no són /noticia/:id', async () => {
    const res = await renderStoryPage(req('/sobre'), makeEnv())
    expect(res).toBeNull()
  })

  it('serveix la pàgina personalitzada quan la peça existeix', async () => {
    const latest = {
      stories: [
        {
          title: 'Una notícia real',
          url: 'https://exemple.cat/peca-real',
          summary: 'Resum de la peça.',
        },
      ],
    }
    const feedStoryId = (await import('../../lib/story-id.js')).feedStoryId
    const id = feedStoryId('https://exemple.cat/peca-real')
    const res = await renderStoryPage(req(`/noticia/${id}`), makeEnv({ latest }))
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Una notícia real')
    expect(html).not.toContain('noindex')
  })

  it('respon amb un 404 real (no la portada disfressada) quan l’id no existeix', async () => {
    const res = await renderStoryPage(req('/noticia/feed-inexistent'), makeEnv())
    expect(res.status).toBe(404)
    const html = await res.text()
    expect(html).toContain('Aquesta pàgina no existeix dins del diari.')
    expect(html).toContain('noindex')
    // El canonical de la plantilla (que apuntava a la portada) ha desaparegut:
    // era precisament el que feia que Google confongués l'article mort amb
    // una còpia de la portada.
    expect(html).not.toMatch(/<link\s+rel="canonical"/i)
  })

  it('el 404 real també cobreix ids amb el format antic (timestamp)', async () => {
    const res = await renderStoryPage(
      req('/noticia/feed-1781136000053-850'),
      makeEnv(),
    )
    expect(res.status).toBe(404)
  })
})
