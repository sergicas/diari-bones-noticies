import { describe, expect, it } from 'vitest'
import { renderContentPage } from '../pageContent.js'
import { seedArticles } from '../../data/articles.js'

// La portada i l'hemeroteca es construeixen amb les peces llavor com a marxa
// enrere. Les peces del gir editorial s'afegeixen al FINAL d'aquell fitxer,
// així que sense ordenar per data el tall a 40 les deixava fora: el dia del
// gir, cap de les cinc peces aprovades no va arribar a la portada.
const novesDelGir = seedArticles.filter((article) => article.editorialSeed)

const TEMPLATE =
  '<!doctype html><html lang="ca"><head><title>El Bon Diari</title></head><body><div id="root"></div></body></html>'

function env() {
  return {
    ASSETS: {
      fetch: async () =>
        new Response(TEMPLATE, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    },
    LIVE_NEWS_KV: { async get() { return null } },
    EDITORIAL_DB: null,
  }
}

async function bodyOf(path) {
  const response = await renderContentPage(
    new Request(`https://bondiari.com${path}`),
    env(),
  )
  return response ? await response.text() : ''
}

describe('les llistes s’ordenen per data', () => {
  it('hi ha peces del gir per comprovar', () => {
    expect(novesDelGir.length).toBeGreaterThan(0)
  })

  it('la portada ensenya les peces més recents del diari', async () => {
    const html = await bodyOf('/')
    for (const peca of novesDelGir) {
      expect(html).toContain(peca.title)
    }
  })

  it('la portada les posa abans que les peces velles', async () => {
    const html = await bodyOf('/')
    const mesNova = [...seedArticles].sort(
      (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
    )[0]
    const mesVella = [...seedArticles].sort(
      (a, b) => new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0),
    )[0]
    const posNova = html.indexOf(mesNova.title)
    const posVella = html.indexOf(mesVella.title)
    expect(posNova).toBeGreaterThanOrEqual(0)
    if (posVella >= 0) expect(posNova).toBeLessThan(posVella)
  })

  it('l’hemeroteca compleix el que promet al lector', async () => {
    // Les fitxes no escriuen la data al HTML, així que l'ordre s'ha de
    // comprovar amb la posició dels titulars: mirar marques de data faria una
    // prova que passa sempre sense comprovar res.
    const html = await bodyOf('/hemeroteca')
    expect(html).toContain('de la més recent a la més antiga')
    const perData = [...seedArticles].sort(
      (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
    )
    const posicions = perData
      .map((peca) => html.indexOf(peca.title))
      .filter((posicio) => posicio >= 0)
    expect(posicions.length).toBeGreaterThan(5)
    expect(posicions).toEqual([...posicions].sort((a, b) => a - b))
  })
})
