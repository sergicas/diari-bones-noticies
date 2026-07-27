// Contingut propi d'El Bon Diari per a cada peça del radar. En una sola crida a
// la IA (Llama, Workers AI) generem, per notícia, DUES coses:
//
//   1) TITULAR i COS reescrits amb paraules pròpies (mateixa llengua, fidelitat):
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
import {
  evaluateEditorialQuality,
  isUsableRewrite,
} from './editorialQuality.js'

const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
// v2 invalida els textos breus de l'etapa inicial. Les claus v1 caduquen soles.
const KV_PREFIX = 'own:v2:'
const CACHE_TTL_SECONDS = 90 * 24 * 3600
const BATCH_SIZE = 5
const MAX_BATCHES = 8 // sostre: fins a 40 peces noves per refresc

const REWRITE_SYSTEM = [
  "Ets l'editor d'El Bon Diari, un mitjà de periodisme constructiu i de servei.",
  'Et passo peces numerades; cada número du la llengua i el tipus entre claudàtors, el',
  'titular original i, sota, una línia "context:" amb els fets disponibles de la font.',
  "Per a CADA número dona'm QUATRE línies EXACTAMENT amb aquest format:",
  'N titular: <titular reescrit>',
  'N cos: <cos reescrit>',
  'N impacte: <per què és útil, constructiva o verificadora>',
  'N imatge: <escena>',
  'TITULAR: reescriu-lo amb paraules TEVES i originals, fidel als fets (mantén qui',
  'i què, sense inventar xifres, dades ni noms), to serè. Ha de ser una frase',
  'natural i llegible (no telegràfica ni tallada), de 6 a 16 paraules, sense',
  'cometes ni símbols, i EXACTAMENT en la llengua indicada (no el tradueixis).',
  'COS: de 4 a 6 frases i entre 80 i 150 paraules, amb paraules TEVES. Ha',
  'd’explicar què ha passat, qui hi intervé, on o quan si consta al context, i',
  'quin és el pas següent o el límit conegut. Utilitza almenys tres fets concrets',
  'del context. NO inventis xifres, dades, cites, llocs ni noms. Si no hi ha prou',
  'fets per escriure un cos rigorós, escriu exactament INFORMACIO_INSUFICIENT al',
  'cos: és preferible no publicar que omplir amb frases buides.',
  'Mateixa llengua que el titular. Sense cometes ni opinions.',
  'Si el tipus és VERIFICACIÓ, estructura el cos amb afirmació comprovada,',
  'veredicte i evidència; conserva amb precisió la negació i no presentis el',
  'rumor desmentit com un fet. Si és AGENDA o OPORTUNITAT, prioritza dates,',
  'lloc, destinataris, termini, accés i què pot fer el lector.',
  'Si és DADES, conserva exactament les xifres, unitats i períodes de referència.',
  'IMPACTE: una frase específica que expliqui per què aquesta peça importa al',
  'lector. No comencis amb "Permet conèixer", "Informa sobre" ni "Aporta una',
  'comprovació". Mateixa llengua, sense cometes.',
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
      // El context de la font s'aporta NOMÉS com a material factual intern; el
      // model l'ha de reescriure i el camp s'elimina abans de publicar.
      const context = String(it.sourceContext || it.summary || '')
        .replace(/\s+/g, ' ')
        .slice(0, 1400)
      return context
        ? `${i + 1}. [${lang}; ${type}] ${title}\n   context: ${context}`
        : `${i + 1}. [${lang}; ${type}] ${title}`
    })
    .join('\n')
  const out = await env.AI.run(AI_MODEL, {
    max_tokens: 3600,
    messages: [
      { role: 'system', content: REWRITE_SYSTEM },
      { role: 'user', content: `Notícies:\n${list}` },
    ],
  })
  return parseOwnContentBatch(String(out?.response || ''), items.length)
}

// Una línia de camp: "1 cos: ...", "1. cos: ...", "**cos**: ..." o simplement
// "cos: ...". El número és OPCIONAL a propòsit.
const FIELD_LINE =
  /^[\s*#>–—-]*(?:(\d{1,2})\s*[.)]?\s*)?\**\s*(titular|cos|impacte|imatge)\**\s*[:–-]\s*(.*)$/i

// Llegeix la resposta del model línia a línia.
//
// El parser anterior exigia el número a CADA línia. Però el model només ho fa
// quan el lot és de dues o tres peces: amb els lots de cinc de producció escriu
// el número al titular i deixa la resta indentada sota:
//
//   1. titular: Mataró inaugura un carril bici entre el centre i la platja
//      cos: L'Ajuntament de Mataró ha estrenat un carril de 1,2 quilòmetres...
//      impacte: ...
//
// Amb l'exigència del número, el "cos" no es trobava mai i totes les peces
// sortien sense text. Aquí el número és opcional: quan no hi és, la línia
// pertany a la peça que s'estava llegint, i un "titular" nou n'obre una altra.
export function parseOwnContentBatch(text, count) {
  const raw = Array.from({ length: count }, () => ({
    titular: '',
    cos: '',
    impacte: '',
    imatge: '',
  }))
  let index = -1
  let field = null

  for (const line of String(text).split('\n')) {
    const match = line.match(FIELD_LINE)
    if (match) {
      const nextField = match[2].toLocaleLowerCase('ca')
      if (match[1] !== undefined) {
        const numbered = parseInt(match[1], 10) - 1
        if (numbered >= 0) index = numbered
      } else if (index < 0) {
        index = 0
      } else if (nextField === 'titular' && raw[index]?.titular) {
        // Llista sense numerar: un titular nou vol dir peça nova.
        index += 1
      }
      if (index < 0 || index >= raw.length) continue
      field = nextField
      raw[index][field] = match[3]
      continue
    }
    // Continuació: un cos que ocupa més d'una línia.
    const continuation = line.trim()
    if (continuation && field && index >= 0 && index < raw.length) {
      raw[index][field] = `${raw[index][field]} ${continuation}`.trim()
    }
  }

  return raw.map((entry) => ({
    title: entry.titular ? cleanTitle(entry.titular) : null,
    body: entry.cos ? cleanProse(entry.cos, 1600) : null,
    impact: entry.impacte ? cleanProse(entry.impacte, 200) : null,
    brief: entry.imatge ? cleanBrief(entry.imatge) : null,
  }))
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
    const existingOwn =
      s.ownContent && s.title && existingBody
        ? { title: s.title, body: existingBody, impact: s.impact || '', brief: '' }
        : null
    const own =
      existingOwn &&
      isUsableRewrite({
        ...s,
        title: existingOwn.title,
        body: [existingOwn.body],
        impact: existingOwn.impact,
      })
        ? existingOwn
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
        const candidate = JSON.parse(cached[i])
        e.own = isUsableRewrite({
          ...e.story,
          title: candidate?.title,
          body: candidate?.body ? [candidate.body] : [],
          impact: candidate?.impact,
        })
          ? candidate
          : null
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
            sourceContext: e.story.sourceContext,
          })),
        )
        await Promise.all(
          group.map((e, j) => {
            const g = generated[j]
            if (!g || !g.title) return null
            const candidate = {
              title: g.title,
              brief: g.brief || '',
              body: g.body || '',
              impact: g.impact || '',
            }
            const rewritten = {
              ...e.story,
              title: candidate.title,
              body: candidate.body ? [candidate.body] : [],
              impact: candidate.impact,
            }
            if (!isUsableRewrite(rewritten)) {
              console.warn(
                JSON.stringify({
                  event: 'editorial.rewrite.rejected',
                  storyId: e.id,
                  issues: evaluateEditorialQuality(rewritten).issues,
                }),
              )
              return null
            }
            e.own = candidate
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
    // El context de font és material de treball, no contingut publicable.
    const { sourceContext: _sourceContext, ...publicStory } = e.story
    return {
      ...publicStory,
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
