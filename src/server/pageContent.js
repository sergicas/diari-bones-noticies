// SSR del cos per a les pàgines que NO són articles: portada (/), pàgines de
// tema (/tema/:slug), hemeroteca (/hemeroteca), índex de temes (/temes) i les
// pàgines fixes (/sobre, /privacitat, /manifest).
//
// Fins ara el Worker només injectava contingut a /noticia/:id (storyMeta.js);
// la resta de rutes arribaven amb el <body> pràcticament buit (<div id="root">
// </div>) i Googlebot no hi veia text. Aquest mòdul reutilitza EXACTAMENT la
// mateixa tècnica que els articles: agafa el mateix index.html prerenderitzat
// (que ja porta el <head> correcte de cada ruta) i reemplaça el #root buit per
// text real. React (createRoot) reemplaça #root en carregar el JS, així que el
// lector no veu res duplicat; els robots i els navegadors sense JS sí que hi
// troben contingut.

import { feedStoryId } from '../lib/story-id.js'
import { seedArticles } from '../data/articles.js'
import {
  EDITORIAL_TOPIC_INDEX,
  getEditorialTopicBySlug,
  classifyAllowedEditorialTopic,
} from '../lib/category.js'
import { readEditorialStoryCatalog } from './editorialStore.js'

const siteName = 'El Bon Diari'
const siteIntro =
  'Periodisme constructiu en català: solucions, verificacions i informació útil amb fonts transparents.'

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Id canònic d'una peça, idèntic a storyDbId d'editorialStore.js: les peces
// llavor duen un slug propi; les del radar i l'hemeroteca es resolen per la URL.
function storyLinkId(story) {
  return story?.id || feedStoryId(story?.url || story?.title || '')
}

function storySummary(story) {
  return (
    (story?.summary && story.summary.trim()) ||
    (story?.impact && story.impact.trim()) ||
    ''
  )
}

// Dedup per id de peça conservant l'ordre d'entrada.
function dedupeStories(stories) {
  const seen = new Set()
  const out = []
  for (const story of stories || []) {
    if (!story || !story.title) continue
    const id = storyLinkId(story)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(story)
  }
  return out
}

// UN DIARI S'ORDENA PER DATA (13-08-2026).
//
// Fins ara aquestes llistes sortien en l'ordre en què arribaven: primer el lot
// en viu, després les peces llavor tal com estan escrites al fitxer. Amb el
// tall a 40, les peces noves —que s'afegeixen al final de la llista— queden
// enterrades sota peces de fa mesos i no arriben mai a la portada. És el que
// va passar el dia del gir editorial: cap de les cinc peces aprovades no va
// sortir a la portada, tot i ser les més recents del diari.
//
// L'Hemeroteca, a més, ja prometia al lector que estava "ordenada de la més
// recent a la més antiga" sense estar-ho.
// Una peça SENSE data no pot caure al fons: totes les peces llavor en tenen,
// així que si en falta és perquè ve del radar en viu, i aquelles són d'avui per
// definició. Enfonsar-les les faria desaparèixer del tall de 40.
function storyTime(story) {
  for (const camp of ['publishedAt', 'sourcePublishedAt', 'firstSeenAt']) {
    const value = new Date(story?.[camp] || 0).getTime()
    if (Number.isFinite(value) && value > 0) return value
  }
  return Number.POSITIVE_INFINITY
}

function byNewestFirst(stories) {
  return [...stories].sort((left, right) => storyTime(right) - storyTime(left))
}

function storyListItem(story) {
  const href = `/noticia/${encodeURIComponent(storyLinkId(story))}`
  const title = escapeHtml(story.title)
  const summary = escapeHtml(storySummary(story))
  const category = story.category
    ? `<p class="ssr-kicker">${escapeHtml(story.category)}</p>`
    : ''
  return [
    '<li>',
    category,
    `<h2><a href="${escapeAttr(href)}">${title}</a></h2>`,
    summary ? `<p>${summary}</p>` : '',
    '</li>',
  ].join('')
}

function buildListBody({ heading, intro, stories, empty }) {
  const parts = ['<main class="ssr-content">', `<h1>${escapeHtml(heading)}</h1>`]
  if (intro) parts.push(`<p>${escapeHtml(intro)}</p>`)
  const list = stories || []
  if (list.length) {
    parts.push('<ul class="ssr-list">')
    for (const story of list) parts.push(storyListItem(story))
    parts.push('</ul>')
  } else if (empty) {
    parts.push(`<p>${escapeHtml(empty)}</p>`)
  }
  parts.push('</main>')
  return parts.join('')
}

// ---- Fonts de dades (sempre amb marxa enrere per no deixar la pàgina buida) --

async function liveStories(env) {
  try {
    const cached = await env.LIVE_NEWS_KV.get('latest', 'json')
    const stories = (cached?.stories || []).filter((s) => s && s.title)
    if (stories.length) return stories
  } catch {
    // Si el KV falla, tirem de les peces llavor.
  }
  return []
}

async function archiveStories(env) {
  try {
    const catalog = await readEditorialStoryCatalog(env, { limit: 1000 })
    if (catalog?.stories?.length) return catalog.stories
  } catch {
    // Si D1 falla, tirem de les peces llavor.
  }
  return []
}

// ---- Cos de cada ruta ------------------------------------------------------

async function buildHome(env) {
  const live = await liveStories(env)
  const stories = byNewestFirst(dedupeStories([...live, ...seedArticles])).slice(0, 40)
  return buildListBody({
    heading: `${siteName} · Periodisme constructiu`,
    intro: siteIntro,
    stories,
  })
}

async function buildHemeroteca(env) {
  const archive = await archiveStories(env)
  const stories = byNewestFirst(dedupeStories([...archive, ...seedArticles])).slice(0, 80)
  return buildListBody({
    heading: `Hemeroteca · ${siteName}`,
    intro:
      "La Hemeroteca d'El Bon Diari conserva les peces que ja han passat per portada, ordenades de la més recent a la més antiga.",
    stories,
    empty: 'La Hemeroteca encara és buida.',
  })
}

async function buildTopic(slug, env) {
  const topic = getEditorialTopicBySlug(slug)
  if (!topic) return null
  const [live, archive] = await Promise.all([liveStories(env), archiveStories(env)])
  const pool = dedupeStories([...live, ...archive, ...seedArticles])
  const stories = byNewestFirst(
    pool.filter((story) => classifyAllowedEditorialTopic(story) === topic.label),
  ).slice(0, 40)
  return buildListBody({
    heading: `${topic.label} · ${siteName}`,
    intro: topic.description,
    stories,
    empty: `Encara no hi ha peces de ${topic.label} a la portada. Torna-hi aviat.`,
  })
}

function buildTopicsIndex() {
  const parts = [
    '<main class="ssr-content">',
    `<h1>Índex de temes · ${siteName}</h1>`,
    `<p>${escapeHtml(
      'La línia temàtica d’El Bon Diari: cada tema recull les històries constructives del seu àmbit.',
    )}</p>`,
    '<ul class="ssr-list">',
  ]
  for (const topic of EDITORIAL_TOPIC_INDEX) {
    const href = `/tema/${encodeURIComponent(topic.id)}`
    parts.push(
      '<li>',
      `<h2><a href="${escapeAttr(href)}">${escapeHtml(topic.label)}</a></h2>`,
      `<p>${escapeHtml(topic.description)}</p>`,
      '</li>',
    )
  }
  parts.push('</ul>', '</main>')
  return parts.join('')
}

// ---- Pàgines fixes (text estàtic i fidel a la versió React) -----------------

const STATIC_BODIES = {
  '/sobre': [
    '<main class="ssr-content">',
    '<h1>El Bon Diari és un diari editorial petit i obert.</h1>',
    '<p>Aquesta pàgina explica qui hi ha darrere, com es trien les notícies, què es recull sobre tu i amb quina llicència es publica.</p>',
    '<h2>Qui hi ha darrere</h2>',
    '<p>El Bon Diari el porta Sergi Castillo, filòsof i editor. Concepte, selecció editorial, disseny i manteniment són responsabilitat seva. Per a qualsevol consulta o suggeriment de notícia, pots escriure a sergicas@gmail.com.</p>',
    '<h2>Quin criteri segueix</h2>',
    '<p>Aquí entren històries constructives, verificacions i informació pràctica amb fonts transparents. Cada peça ha d’aportar evidència, context o una acció útil; no hi ha optimisme buit ni opinió per opinar.</p>',
    '<h2>Què recollim sobre tu</h2>',
    '<p>El menys possible. El Bon Diari no usa cookies de seguiment ni serveis d’analítica externs (no hi ha Google Analytics, Facebook Pixel, AdSense ni similars). Tampoc demana cap dada personal per llegir.</p>',
    '<h2>Llicència del contingut</h2>',
    '<p>Les peces editorials d’El Bon Diari es publiquen sota llicència Creative Commons BY-NC-SA 4.0: pots reutilitzar-les si en cites l’autoria, no en fas un ús comercial i les comparteixes amb la mateixa llicència.</p>',
    '<h2>Tecnologia</h2>',
    '<p>Web feta amb React + Vite i executada a Cloudflare Workers, publicada des de Tarragona.</p>',
    '</main>',
  ].join(''),
  '/privacitat': [
    '<main class="ssr-content">',
    '<h1>Política de privacitat</h1>',
    '<p>Política de privacitat d’El Bon Diari: quines dades es recullen al web i a l’app, notificacions push, butlletí i els teus drets.</p>',
    '<h2>Llegir no requereix cap dada</h2>',
    '<p>No cal registre ni cap dada personal per llegir El Bon Diari, i no s’usen cookies de seguiment ni analítica de tercers.</p>',
    '<h2>Comptador de visites (anònim i agregat)</h2>',
    '<p>Es compten les visites amb un comptador propi i agregat que no identifica personalment ningú: no es desa cap identificador, IP ni perfil de lector.</p>',
    '<h2>Butlletí (newsletter)</h2>',
    '<p>Si t’hi subscrius, es desa el teu correu per enviar-te el butlletí; te’n pots donar de baixa en qualsevol moment des de l’enllaç de cada enviament.</p>',
    '<h2>Notificacions push</h2>',
    '<p>El servidor guarda només la subscripció de l’aparell i l’opció triada. Els avisos són opcionals, tenen un topall d’un al dia i la baixa esborra la subscripció.</p>',
    '<h2>Preferència de comarca</h2>',
    '<p>La comarca preferida es guarda només al navegador. El servidor rep el codi 13 o 21 sota demanda per consultar les fonts oficials, sense desar-lo com a perfil i sense usar la IP ni geolocalització.</p>',
    '<h2>Els teus drets</h2>',
    '<p>Pots demanar accés, rectificació o supressió de qualsevol dada escrivint a sergicas@gmail.com.</p>',
    '</main>',
  ].join(''),
  '/manifest': [
    '<main class="ssr-content">',
    '<h1>Una mirada constructiva necessita evidència, utilitat i límits.</h1>',
    '<p>Aquest és el marc amb què El Bon Diari tria solucions, verificacions i informació pràctica, i explica quin valor té per a qui ho llegeix.</p>',
    '<h2>Com publiquem sense caure en l’optimisme buit</h2>',
    '<p>Cada peça ha d’aportar evidència comprovable, context honest i, sempre que es pugui, una acció o un aprenentatge replicable. No publiquem bones notícies per quedar bé: publiquem allò que funciona i es pot verificar amb fonts transparents.</p>',
    '</main>',
  ].join(''),
  '/preferencies': [
    '<main class="ssr-content">',
    '<h1>Els meus interessos</h1>',
    '<p>Tria temes i territoris per realçar peces sense canviar mai l’ordre editorial de la portada. Les preferències es guarden només al teu dispositiu.</p>',
    '<h2>Notificacions sense soroll</h2>',
    '<p>Pots rebre la peça del dia, amb un màxim d’un avís diari, o mantenir-les desactivades.</p>',
    '</main>',
  ].join(''),
  '/territori': [
    '<main class="ssr-content">',
    '<h1>Proximitat territorial</h1>',
    '<p>Agenda cultural, concessions públiques i indicadors oficials del Barcelonès i el Maresme.</p>',
    '<h2>La comarca la tries tu</h2>',
    '<p>La preferència es guarda només al navegador. No fem servir la IP ni geolocalització, i les fonts oficials es consulten sota demanda amb memòria cau pròpia.</p>',
    '</main>',
  ].join(''),
}

// ---- Injecció i entrada pública --------------------------------------------

// Reemplaça el #root buit del template pel cos SSR. Idèntic a storyMeta.js.
export function injectBodyIntoRoot(html, bodyHtml) {
  return html.replace(/<div id="root">\s*<\/div>/i, `<div id="root">${bodyHtml}</div>`)
}

function normalizePath(pathname) {
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

// Decideix quin cos correspon a la ruta. Retorna null si la ruta no és una de
// les que gestionem (llavors el caller fa el fallback normal a ASSETS).
async function buildBodyForPath(path, env) {
  if (path === '/') return buildHome(env)
  if (path === '/hemeroteca') return buildHemeroteca(env)
  if (path === '/temes') return buildTopicsIndex()
  if (STATIC_BODIES[path]) return STATIC_BODIES[path]
  const topicMatch = path.match(/^\/tema\/([^/]+)$/)
  if (topicMatch) {
    let slug = topicMatch[1]
    try {
      slug = decodeURIComponent(slug)
    } catch {
      // deixem el valor cru si no es pot descodificar
    }
    return buildTopic(slug, env)
  }
  return null
}

// Serveix una pàgina de contingut (no-article) amb text real dins del HTML.
// Retorna una Response o null si la ruta no li pertoca o no s'ha pogut construir
// el template.
export async function renderContentPage(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const url = new URL(request.url)
  const path = normalizePath(url.pathname)

  const body = await buildBodyForPath(path, env)
  if (body == null) return null

  // Agafem el mateix fitxer prerenderitzat de la ruta (porta el <head> correcte)
  // i només li canviem el cos. Per a rutes amb barra final o sense, ASSETS ja
  // resol l'index.html del directori.
  const assetResponse = await env.ASSETS.fetch(
    new Request(`${url.origin}${url.pathname}`, request),
  )
  if (!assetResponse.ok) return null
  const html = await assetResponse.text()
  if (!/<div id="root">\s*<\/div>/i.test(html)) {
    // El template ja no té el #root buit esperat: millor no tocar res.
    return null
  }

  return new Response(injectBodyIntoRoot(html, body), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  })
}

export {
  buildListBody,
  buildTopicsIndex,
  storyLinkId,
  STATIC_BODIES,
}
