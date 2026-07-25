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
  "Ets l'editor d'El Bon Diari, un mitjà de periodisme constructiu i de servei.",
  'Et passo peces numerades; cada número du la llengua i el tipus entre claudàtors, el',
  'titular original i, sota, una línia "resum:" amb els fets de la font (si n\'hi ha).',
  "Per a CADA número dona'm QUATRE línies EXACTAMENT amb aquest format:",
  'N titular: <titular reescrit>',
  'N cos: <cos reescrit>',
  'N impacte: <per què és útil, constructiva o verificadora>',
  'N imatge: <escena>',
  'TITULAR: reescriu-lo amb paraules TEVES i originals, fidel als fets (mantén qui',
  'i què, sense inventar xifres, dades ni noms), to serè. Ha de ser una frase',
  'natural i llegible (no telegràfica ni tallada), de 6 a 16 paraules, sense',
  'cometes ni símbols, i EXACTAMENT en la llengua indicada (no el tradueixis).',
  'COS: de 2 a 4 frases amb paraules TEVES que expliquin la notícia a partir NOMÉS',
  "dels fets del titular i del resum donat. NO inventis xifres, dades, cites, llocs",
  'ni noms que no apareguin al material; si hi ha poca informació, sigues sobri i',
  'general en lloc d\'inventar. Mateixa llengua que el titular. Sense cometes.',
  'Si el tipus és VERIFICACIÓ, conserva amb precisió la negació i no presentis',
  'el rumor desmentit com un fet. Si és AGENDA o OPORTUNITAT, prioritza què pot',
  'fer el lector i no ho converteixis artificialment en una bona notícia.',
  'Si és DADES, conserva exactament les xifres, unitats i períodes de referència.',
  'IMPACTE: una sola frase breu que expliqui què permet entendre, comprovar o fer.',
  'Mateixa llengua, sense cometes.',
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
  if (story.editorialFormat === 'verification') return 'Una verificació pendent de resum'
  if (story.editorialFormat === 'agenda') return 'Una proposta de l’agenda'
  if (story.editorialFormat === 'opportunity') return 'Una oportunitat útil'
  if (story.editorialFormat === 'data') return 'Una dada pública actualitzada'
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

// Neteja per al cos i l'impacte: manté puntuació i apòstrofs (a diferència de
// cleanBrief, que és per a l'escena d'imatge en anglès), només treu cometes,
// guillemots i separadors sobrants.
function cleanProse(raw, max) {
  return String(raw || '')
    .replace(/[«»"“”]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s|·:—–-]+/, '')
    .replace(/[\s|·]+$/, '')
    .trim()
    .slice(0, max)
}

async function aiOwnContentBatch(env, items) {
  const typeLabels = {
    constructive: 'CONSTRUCTIVA',
    verification: 'VERIFICACIÓ',
    agenda: 'AGENDA',
    opportunity: 'OPORTUNITAT',
    data: 'DADES',
  }
  const list = items
    .map((it, i) => {
      const lang = LANG_NAMES[it.language] || 'català'
      const type = typeLabels[it.editorialFormat] || typeLabels.constructive
      const title = String(it.title || '').replace(/\s+/g, ' ').slice(0, 160)
      // El resum de la font s'aporta NOMÉS com a context de fets perquè el cos
      // sigui verídic; el model l'ha de reescriure amb paraules pròpies (no es
      // publica mai copiat).
      const summary = String(it.summary || '').replace(/\s+/g, ' ').slice(0, 320)
      return summary
        ? `${i + 1}. [${lang}; ${type}] ${title}\n   resum: ${summary}`
        : `${i + 1}. [${lang}; ${type}] ${title}`
    })
    .join('\n')
  const out = await env.AI.run(AI_MODEL, {
    max_tokens: 2200,
    messages: [
      { role: 'system', content: REWRITE_SYSTEM },
      { role: 'user', content: `Notícies:\n${list}` },
    ],
  })
  const text = String(out?.response || '')
  const result = items.map(() => ({ title: null, brief: null, body: null, impact: null }))
  for (const line of text.split('\n')) {
    const mt = line.match(/^\s*(\d{1,2})\s*[.)]?\s*titular\s*[:-]\s*(.+?)\s*$/i)
    if (mt) {
      const idx = parseInt(mt[1], 10) - 1
      if (idx >= 0 && idx < result.length && !result[idx].title) result[idx].title = cleanTitle(mt[2])
      continue
    }
    const mc = line.match(/^\s*(\d{1,2})\s*[.)]?\s*cos\s*[:-]\s*(.+?)\s*$/i)
    if (mc) {
      const idx = parseInt(mc[1], 10) - 1
      if (idx >= 0 && idx < result.length && !result[idx].body) result[idx].body = cleanProse(mc[2], 600)
      continue
    }
    const mp = line.match(/^\s*(\d{1,2})\s*[.)]?\s*impacte\s*[:-]\s*(.+?)\s*$/i)
    if (mp) {
      const idx = parseInt(mp[1], 10) - 1
      if (idx >= 0 && idx < result.length && !result[idx].impact) result[idx].impact = cleanProse(mp[2], 200)
      continue
    }
    const mi = line.match(/^\s*(\d{1,2})\s*[.)]?\s*imatge\s*[:-]\s*(.+?)\s*$/i)
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
  const entries = stories.map((s) => {
    const existingBody = Array.isArray(s.body)
      ? s.body.filter(Boolean).join(' ')
      : ''
    const own =
      s.ownContent && s.title && existingBody
        ? {
            title: s.title,
            body: existingBody,
            impact: s.impact || '',
            brief: '',
          }
        : null
    return {
      story: s,
      id: feedStoryId(s.url),
      own,
    }
  })

  // 1) Contingut ja generat (cache)
  if (kv) {
    const cached = await Promise.all(entries.map((e) => kv.get(KV_PREFIX + e.id)))
    entries.forEach((e, i) => {
      if (e.own) return
      if (!cached[i]) return
      try {
        e.own = JSON.parse(cached[i])
      } catch {
        e.own = null
      }
    })
  }

  // 2) Generem el que falta, en lots (si hi ha IA). Regenerem també les entrades
  //    antigues que només tenien titular (cache pre-cos) perquè guanyin el cos.
  const misses = entries.filter((e) => !e.own || !e.own.title || !e.own.body)
  if (env?.AI && misses.length > 0) {
    for (let b = 0; b < misses.length && b / BATCH_SIZE < MAX_BATCHES; b += BATCH_SIZE) {
      const group = misses.slice(b, b + BATCH_SIZE)
      try {
        const generated = await aiOwnContentBatch(
          env,
          group.map((e) => ({
            title: e.story.title,
            language: e.story.language,
            editorialFormat: e.story.editorialFormat,
            summary: e.story.summary,
          })),
        )
        await Promise.all(
          group.map((e, j) => {
            const g = generated[j]
            if (!g || !g.title) return null
            e.own = {
              title: g.title,
              brief: g.brief || '',
              body: g.body || '',
              impact: g.impact || '',
            }
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

  // 3) Muntem el resultat: titular propi, cos propi (reescrit dels fets de la
  //    font), impacte propi, imatge lligada a la notícia i SENSE resum copiat.
  //    ownContent marca si la peça té contingut propi real; getLiveNewsPayload
  //    NO publica les que no en tenen (evita targetes buides "Una bona notícia · X").
  return entries.map((e) => {
    const own = e.own || {}
    const hasOwnContent = Boolean(own.title && own.body)
    const title = own.title || genericTitle(e.story)
    const body = own.body ? [own.body] : []
    // Encara que hi hagi brief per a la IA, passem sempre títol i categoria:
    // són el que compon la targeta de reserva si la generació no arriba.
    const imageUrl = storyImagePath(e.story.url, {
      brief: own.brief || '',
      title: title || e.story.title,
      category: e.story.category,
    })
    return {
      ...e.story,
      title,
      summary: '',
      body,
      impact: own.impact || '',
      imageUrl,
      imageCredit: 'El Bon Diari (il·lustració IA)',
      imageAttributionUrl: '',
      ownContent: hasOwnContent,
    }
  })
}
