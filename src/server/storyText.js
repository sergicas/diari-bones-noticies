// Contingut propi d'El Bon Diari per a cada peça del radar. En una sola crida a
// la IA (Llama, Workers AI) generem, per notícia, DUES coses:
//
//   1) TITULAR reescrit amb paraules pròpies (mateixa llengua, fidel als fets):
//      per no reproduir el text protegit del mitjà (drets d'autor / dret dels
//      editors de premsa). El resum copiat s'elimina (summary = '').
//   2) ESCENA visual concreta (en anglès) per il·lustrar AQUESTA notícia: així
//      el dibuix està relacionat amb la peça (un tramvia, una biblioteca…) i no
//      és un motiu genèric de secció. La il·lustració es genera a storyImage.js
//      a partir d'aquesta escena, sense text.
//
// Es genera un sol cop per peça i es cacheja (own:<id>). Els fets no estan
// protegits; l'expressió sí: reformular-ho ens treu de "republicar".

import { feedStoryId } from '../lib/story-id.js'
import { storyImagePath } from '../lib/story-image-path.js'

const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const KV_PREFIX = 'own:'
const CACHE_TTL_SECONDS = 90 * 24 * 3600
const BATCH_SIZE = 8
const MAX_BATCHES = 5 // sostre: fins a 40 peces noves per refresc

const REWRITE_SYSTEM = [
  "Ets l'editor d'El Bon Diari, un diari de bones notícies.",
  'Et passo titulars de premsa numerats; cadascun du la seva llengua entre claudàtors.',
  'Per a CADA número dona\'m DUES línies EXACTAMENT amb aquest format:',
  'N titular: <titular reescrit>',
  'N imatge: <escena>',
  'TITULAR: reescriu-lo amb paraules TEVES i originals, fidel als fets (mantén qui',
  'i què, sense inventar xifres, dades ni noms), to serè. Ha de ser una frase',
  'natural i llegible (no telegràfica ni tallada), de 6 a 16 paraules, sense',
  'cometes ni símbols, i EXACTAMENT en la llengua indicada (no el tradueixis).',
  'IMATGE: una escena visual concreta EN ANGLÈS per dibuixar la notícia; descriu',
  'objectes i entorn (exemple: "a modern tram on a tree-lined city avenue at',
  'sunrise"). Sense noms propis, sense marques, sense persones reals identificables',
  'i sense cap text. Simbòlica i serena, màxim 12 paraules.',
].join(' ')

const LANG_NAMES = {
  ca: 'català',
  es: 'castellà',
  en: 'anglès',
  fr: 'francès',
  it: 'italià',
  pt: 'portuguès',
}

const GENERIC_BY_LANG = {
  ca: 'Una bona notícia',
  es: 'Una buena noticia',
  en: 'Some good news',
  fr: 'Une bonne nouvelle',
  it: 'Una buona notizia',
  pt: 'Uma boa notícia',
}

function genericTitle(story) {
  const base = GENERIC_BY_LANG[story.language] || GENERIC_BY_LANG.ca
  return story.category ? `${base} · ${story.category}` : base
}

function cleanTitle(raw) {
  return String(raw || '')
    .replace(/^\s*\[[^\]]*\]\s*/, '') // fora "[llengua]" si el model l'ha repetit
    .replace(/[«»"“”]/g, '') // fora cometes i guillemots (mantenim els apòstrofs ' ’)
    .replace(/\s+/g, ' ')
    .replace(/^[\s|·:—–-]+/, '') // fora separadors/símbols al principi
    .replace(/[\s|·:—–.]+$/, '') // ...i al final
    .trim()
}

function cleanBrief(raw) {
  return String(raw || '')
    .replace(/[|:"'«»“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.\s*$/, '')
    .trim()
    .slice(0, 200)
}

async function aiOwnContentBatch(env, items) {
  const list = items
    .map((it, i) => {
      const lang = LANG_NAMES[it.language] || 'català'
      return `${i + 1}. [${lang}] ${String(it.title || '').replace(/\s+/g, ' ').slice(0, 160)}`
    })
    .join('\n')
  const out = await env.AI.run(AI_MODEL, {
    max_tokens: 900,
    messages: [
      { role: 'system', content: REWRITE_SYSTEM },
      { role: 'user', content: `Titulars:\n${list}` },
    ],
  })
  const text = String(out?.response || '')
  const result = items.map(() => ({ title: null, brief: null }))
  for (const line of text.split('\n')) {
    const mt = line.match(/^\s*(\d{1,2})\s*[.)]?\s*titular\s*[:\-]\s*(.+?)\s*$/i)
    if (mt) {
      const idx = parseInt(mt[1], 10) - 1
      if (idx >= 0 && idx < result.length && !result[idx].title) result[idx].title = cleanTitle(mt[2])
      continue
    }
    const mi = line.match(/^\s*(\d{1,2})\s*[.)]?\s*imatge\s*[:\-]\s*(.+?)\s*$/i)
    if (mi) {
      const idx = parseInt(mi[1], 10) - 1
      if (idx >= 0 && idx < result.length && !result[idx].brief) result[idx].brief = cleanBrief(mi[2])
    }
  }
  return result
}

// Rep el lot final de peces i en torna una versió amb titular propi, il·lustració
// pròpia LLIGADA a la notícia i sense resum copiat. Cap peça publica text ni foto
// del mitjà: si la IA no dona contingut, reserva neutra (mai el del mitjà).
export async function applyOwnContent(stories, env) {
  const kv = env?.LIVE_NEWS_KV
  const entries = stories.map((s) => ({ story: s, id: feedStoryId(s.url), own: null }))

  // 1) Contingut ja generat (cache)
  if (kv) {
    const cached = await Promise.all(entries.map((e) => kv.get(KV_PREFIX + e.id)))
    entries.forEach((e, i) => {
      if (!cached[i]) return
      try {
        e.own = JSON.parse(cached[i])
      } catch {
        e.own = null
      }
    })
  }

  // 2) Generem el que falta, en lots (si hi ha IA)
  const misses = entries.filter((e) => !e.own || !e.own.title)
  if (env?.AI && misses.length > 0) {
    for (let b = 0; b < misses.length && b / BATCH_SIZE < MAX_BATCHES; b += BATCH_SIZE) {
      const group = misses.slice(b, b + BATCH_SIZE)
      try {
        const generated = await aiOwnContentBatch(
          env,
          group.map((e) => ({ title: e.story.title, language: e.story.language })),
        )
        await Promise.all(
          group.map((e, j) => {
            const g = generated[j]
            if (!g || !g.title) return null
            e.own = { title: g.title, brief: g.brief || '' }
            return kv
              ? kv.put(KV_PREFIX + e.id, JSON.stringify(e.own), { expirationTtl: CACHE_TTL_SECONDS })
              : null
          }),
        )
      } catch (error) {
        console.error('[storyText] batch', error?.message || error)
      }
    }
  }

  // 3) Muntem el resultat: titular propi, imatge lligada a la notícia (o motiu de
  // secció si no hi ha escena) i SENSE resum copiat.
  return entries.map((e) => {
    const own = e.own || {}
    const title = own.title || genericTitle(e.story)
    const imageUrl = own.brief
      ? storyImagePath(e.story.url, { brief: own.brief })
      : storyImagePath(e.story.url, { title: e.story.title, category: e.story.category })
    return {
      ...e.story,
      title,
      summary: '',
      imageUrl,
      imageCredit: 'El Bon Diari (il·lustració IA)',
      imageAttributionUrl: '',
    }
  })
}
