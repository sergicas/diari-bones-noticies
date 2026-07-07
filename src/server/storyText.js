// Titulars propis d'El Bon Diari. Per no reproduir el text protegit dels
// mitjans (titular i entradeta literals = risc de drets d'autor, i a Espanya el
// dret dels editors de premsa), NO publiquem el titular ni el resum tal qual:
//
//   - El titular es REESCRIU amb paraules pròpies (mateixa llengua, fidel als
//     fets, sense afegir res) amb la IA de Cloudflare, i es cacheja per peça.
//   - El resum copiat del mitjà s'ELIMINA (summary = ''): a la peça hi queda la
//     línia d'impacte pròpia i l'enllaç a la font perquè el lector ho verifiqui.
//
// Els fets no estan protegits; l'expressió sí. Reformular-ho ens treu de
// "republicar" i ens posa a "informar amb veu pròpia". Es genera un sol cop per
// peça (cachejat), igual que les il·lustracions (vegeu storyImage.js).

import { feedStoryId } from '../lib/story-id.js'

const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const KV_PREFIX = 'rwt:'
const CACHE_TTL_SECONDS = 90 * 24 * 3600
const BATCH_SIZE = 10
const MAX_BATCHES = 4 // sostre: fins a 40 titulars nous per refresc

const REWRITE_SYSTEM = [
  "Ets l'editor d'El Bon Diari.",
  'Et passo una llista numerada de titulars de premsa. Cada titular du entre',
  'claudàtors la llengua en què està escrit.',
  "Reescriu CADA titular amb paraules TEVES i originals, sense copiar-ne l'estructura.",
  'REGLA CLAU: escriu cada titular reescrit EXACTAMENT en la llengua indicada',
  'entre claudàtors; NO el tradueixis a cap altra llengua.',
  'Sigues fidel als fets: mantén qui i què, però no afegeixis res, no exageris i',
  'no inventis xifres, dades ni noms. To serè i clar. Màxim 16 paraules, sense',
  'claudàtors, sense cometes i sense punt final.',
  'Respon NOMÉS una línia per número amb aquest format exacte:',
  'N: <titular reescrit>',
].join(' ')

const LANG_NAMES = {
  ca: 'català',
  es: 'castellà',
  en: 'anglès',
  fr: 'francès',
  it: 'italià',
  pt: 'portuguès',
}

// Reserva neutra (mai el titular del mitjà) si la IA no respon, perquè el diari
// no es buidi mai. Es reemplaça per la reescriptura bona al refresc següent.
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

async function aiRewriteBatch(env, items) {
  const list = items
    .map((it, i) => {
      const lang = LANG_NAMES[it.language] || 'català'
      return `${i + 1}. [${lang}] ${String(it.title || '').replace(/\s+/g, ' ').slice(0, 160)}`
    })
    .join('\n')
  const out = await env.AI.run(AI_MODEL, {
    max_tokens: 512,
    messages: [
      { role: 'system', content: REWRITE_SYSTEM },
      { role: 'user', content: `Titulars:\n${list}` },
    ],
  })
  const text = String(out?.response || '')
  const result = new Array(items.length).fill(null)
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d{1,2})\s*[:.)\-]\s*(.+?)\s*$/)
    if (!m) continue
    const idx = parseInt(m[1], 10) - 1
    if (idx < 0 || idx >= items.length || result[idx]) continue
    // Neteja: fora cometes envoltants i punt final.
    const clean = m[2].replace(/^["'«»“”]+|["'«»“”.]+$/g, '').trim()
    if (clean) result[idx] = clean
  }
  return result
}

// Rep el lot final de peces i en torna una versió amb titular propi i sense
// resum copiat. Les peces per a les quals no s'aconsegueix titular propi (ni
// cachejat ni reescrit ara) reben una reserva neutra: MAI el titular del mitjà.
export async function applyOwnHeadlines(stories, env) {
  const kv = env?.LIVE_NEWS_KV
  const entries = stories.map((s) => ({ story: s, id: feedStoryId(s.url), title: null }))

  // 1) Titulars ja reescrits (cache)
  if (kv) {
    const cached = await Promise.all(entries.map((e) => kv.get(KV_PREFIX + e.id)))
    entries.forEach((e, i) => {
      e.title = cached[i] || null
    })
  }

  // 2) Reescrivim els que falten, en lots (si hi ha IA)
  const misses = entries.filter((e) => !e.title)
  if (env?.AI && misses.length > 0) {
    for (let b = 0; b < misses.length && b / BATCH_SIZE < MAX_BATCHES; b += BATCH_SIZE) {
      const group = misses.slice(b, b + BATCH_SIZE)
      try {
        const rewrites = await aiRewriteBatch(
          env,
          group.map((e) => ({ title: e.story.title, language: e.story.language })),
        )
        await Promise.all(
          group.map((e, j) => {
            const rw = rewrites[j]
            if (!rw) return null
            e.title = rw
            return kv ? kv.put(KV_PREFIX + e.id, rw, { expirationTtl: CACHE_TTL_SECONDS }) : null
          }),
        )
      } catch (error) {
        console.error('[storyText] rewrite batch', error?.message || error)
      }
    }
  }

  // 3) Muntem el resultat: titular propi (o reserva neutra) i SENSE resum copiat.
  return entries.map((e) => ({
    ...e.story,
    title: e.title || genericTitle(e.story),
    summary: '',
  }))
}
