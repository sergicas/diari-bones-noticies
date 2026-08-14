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
import { hasVerifiedImageRights } from '../lib/imageRules.js'
import { runTextModel } from './ai/textModel.js'
import {
  evaluateEditorialQuality,
  isUsableRewrite,
} from './editorialQuality.js'

// El model de text el tria ara ./ai/textModel.js (Gemini o Cloudflare segons hi
// hagi clau). Aquí ja no s'anomena cap model directament.
// v2 invalida els textos breus de l'etapa inicial. Les claus v1 caduquen soles.
// v4 (14-08-2026) invalida el text escrit abans de posar la regla de la llengua
// al final del prompt i amb exemple.
// v3 invalidava TOT el text escrit mentre la instrucció deia "no el
// tradueixis": eren peces en anglès en un diari en català. Sense pujar la
// versió, arreglar la instrucció no hauria servit de res, perquè el text ja
// generat se serveix d'aquesta còpia i no es torna a demanar mai.
//
// REGLA: sempre que es canviï el que se li demana al redactor, s'ha de pujar
// aquesta versió. Si no, el canvi només afecta les peces que encara no
// existeixen. Les claus velles caduquen soles als 90 dies.
const KV_PREFIX = 'own:v5:'

// La clau del cau porta la LLENGUA DE SORTIDA, no només l'identificador.
//
// Sense això, una peça pot reutilitzar una redacció feta per a una altra
// llengua: exactament el que va passar mentre `outputLanguage` es perdia pel
// camí i el text es generava en anglès. Amb la llengua a la clau, un text en
// anglès i un en català no poden ocupar mai el mateix lloc.
function cacheKeyFor(story, id) {
  const lang = story?.outputLanguage || story?.language || 'ca'
  return `${KV_PREFIX}${lang}:${id}`
}
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
  // LA LLENGUA DE SORTIDA MANA (14-08-2026).
  //
  // Abans aquí hi deia "EXACTAMENT en la llengua indicada (no el tradueixis)".
  // Amb fonts catalanes volia dir "no canviïs d'idioma" i anava bé. Amb el gir
  // editorial, TOTES les fonts són en anglès i la sortida ha de ser en català:
  // el model veia un original en anglès, llegia "no el tradueixis" i el deixava
  // en anglès. Les 25 primeres peces de la sala van sortir així.
  //
  // I no és cap contradicció amb el Circuit B, que prohibeix traduir i
  // republicar: aquí no es tradueix res, s'escriu de nou a partir dels fets. La
  // instrucció ho ha de dir amb aquestes paraules.
  'cometes ni símbols, i escrit SEMPRE en la llengua indicada entre claudàtors,',
  'encara que el material de context estigui en una altra llengua. No el',
  'tradueixis paraula per paraula: escriu-lo de nou en aquella llengua.',
  'COS: de 4 a 6 frases i entre 80 i 150 paraules, amb paraules TEVES. Ha',
  'd’explicar què ha passat, qui hi intervé, on o quan si consta al context, i',
  'quin és el pas següent o el límit conegut. Utilitza almenys tres fets concrets',
  'del context. NO inventis xifres, dades, cites, llocs ni noms. Si no hi ha prou',
  'fets per escriure un cos rigorós, escriu exactament INFORMACIO_INSUFICIENT al',
  'cos: és preferible no publicar que omplir amb frases buides.',
  'Escrit SEMPRE en la llengua indicada entre claudàtors, encara que el context',
  'estigui en una altra llengua. Sense cometes ni opinions.',
  'Si el tipus és VERIFICACIÓ, estructura el cos amb afirmació comprovada,',
  'veredicte i evidència; conserva amb precisió la negació i no presentis el',
  'rumor desmentit com un fet. Si és AGENDA o OPORTUNITAT, prioritza dates,',
  'lloc, destinataris, termini, accés i què pot fer el lector.',
  'Si és DADES, conserva exactament les xifres, unitats i períodes de referència.',
  'IMPACTE: una frase específica que expliqui per què aquesta peça importa al',
  'lector. No comencis amb "Permet conèixer", "Informa sobre" ni "Aporta una',
  'comprovació". Escrit SEMPRE en la llengua indicada entre claudàtors, encara',
  'que el context estigui en una altra llengua. Sense cometes.',
  'IMATGE: una escena visual concreta EN ANGLÈS per dibuixar la notícia; descriu',
  'objectes i entorn (exemple: "a modern tram on a tree-lined city avenue at',
  'sunrise"). Sense noms propis, sense marques, sense persones reals identificables',
  'i sense cap text. Simbòlica i serena, màxim 12 paraules.',
  // LA REGLA DE LA LLENGUA, AL FINAL I AMB EXEMPLE.
  //
  // Dir-ho un cop enmig del prompt no bastava: amb un titular i 1.400
  // caràcters de context en anglès, el model seguia la llengua del material i
  // escrivia en anglès, encara que la peça anés marcada [català]. Va tornar a
  // passar amb la instrucció ja corregida.
  //
  // Per això va al final (és l'última cosa que llegeix) i amb un exemple
  // d'entrada anglesa i sortida catalana, que és el senyal que de debò
  // convenç un model petit.
  // DE QUI ÉS LA FEINA (14-08-2026).
  //
  // Una peça del MIT Technology Review va sortir dient "Quan vam preguntar als
  // joves…", com si l'entrevista l'haguéssim feta nosaltres. No és un detall
  // d'estil: és atribuir-se el treball de camp d'un altre mitjà, i va
  // directament contra el Circuit B, que exigeix peça pròpia amb la font ben
  // acreditada.
  'DE QUI ÉS LA FEINA: la investigació, les entrevistes i el treball de camp',
  'SÓN DE LA FONT que es marca a cada peça, no nostres. Escriu SEMPRE en',
  'tercera persona i atribueix-los-hi de manera explícita: "MIT Technology',
  'Review va preguntar a…", "segons l’estudi publicat a…", "l’equip de…".',
  'MAI escriguis "vam preguntar", "hem parlat amb", "la nostra enquesta" ni cap',
  'altra forma que faci semblar que la feina és nostra. Nosaltres expliquem el',
  'que ha trobat una altra persona; no ho hem trobat nosaltres.',
  'REGLA MÉS IMPORTANT DE TOTES, per damunt de qualsevol altra:',
  'el titular, el cos i l’impacte s’han d’escriure EN LA LLENGUA marcada entre',
  'claudàtors a cada peça. Gairebé sempre serà [català]. El titular original i',
  'el context estaran gairebé sempre en ANGLÈS: és material de treball, no un',
  'model d’estil. No copiïs la seva llengua.',
  'Exemple. Entrada: "1. [català; CONSTRUCTIVA] Scientists find new method to',
  'clean water with sunlight | context: A team developed a low-cost solar',
  'device that purifies water in rural areas."',
  'Sortida correcta: "1 titular: Un dispositiu solar de baix cost potabilitza',
  'aigua en zones rurals" i el cos i l’impacte també en català.',
  'Sortida INCORRECTA: qualsevol titular, cos o impacte en anglès.',
  '(L’única excepció és la línia "imatge:", que va sempre en anglès perquè és',
  'una instrucció per a un generador d’imatges, no un text per al lector.)',
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

// Titulars de fins a 20 paraules. Els oficials —convocatòries, estudis— sovint
// són més llargs, i abans això tombava tota la peça encara que el cos fos bo.
// Aquí s'escurça pel primer tall NATURAL que hi hagi abans del límit (dos
// punts, guió llarg, coma o punt i coma); si no n'hi ha cap, es talla per
// paraules. Mai no es publica un titular tallat a mitja paraula ni acabat en
// connector.
export const MAX_TITLE_WORDS = 20
const MIN_TITLE_WORDS_KEPT = 5

// Paraules que no poden tancar un titular perquè demanen complement. Tallar per
// nombre de paraules deixava coses com "...del medi rural de Catalunya durant".
const TRAILING_CONNECTORS = new RegExp(
  '\\s+(?:' +
    [
      // català
      'i|o|de|del|dels|d|a|al|als|en|amb|per|sense|sobre|sota|entre|fins|des|durant',
      'contra|cap|segons|malgrat|mitjançant|després|abans|que|qui|com|on',
      'el|la|els|les|un|una|uns|unes|l',
      // castellà
      'y|e|u|con|desde|hasta|para|por|según|sin|tras|del|los|las|unos|unas',
      // anglès
      'and|or|of|for|with|from|to|at|by|in|on|the|an|that|which|as',
      // francès, italià, portuguès
      'du|des|au|aux|avec|pour|par|sur|sans|dans|di|della|dello|dei|degli|con|su',
      'tra|fra|da|em|no|na|dos|das|ao|aos|sem|como',
    ].join('|') +
    ')$',
  'i',
)

export function shortenTitle(raw, max = MAX_TITLE_WORDS) {
  const title = String(raw || '').trim()
  if (!title) return ''
  const words = title.split(/\s+/u)
  if (words.length <= max) return title

  const limit = words.slice(0, max).join(' ')

  // 1) Tall natural: un separador fort dins del límit, si el que queda al
  //    davant ja és un titular sencer.
  const natural = limit.match(/^(.{12,}?)\s*[:—–;]\s*\S/u)
  if (natural && natural[1].split(/\s+/u).length >= MIN_TITLE_WORDS_KEPT) {
    return natural[1].replace(/[\s:—–;,]+$/u, '').trim()
  }

  // 2) Tall per paraules, retirant els connectors que quedin al final.
  let cut = limit
  for (let i = 0; i < 4; i += 1) {
    const trimmed = cut.replace(TRAILING_CONNECTORS, '')
    if (trimmed === cut) break
    cut = trimmed
  }
  cut = cut.replace(/[\s:—–;,.]+$/u, '').trim()
  // Si de tant retallar el titular queda massa curt, val més el tall net per
  // paraules que una frase mutilada.
  return cut.split(/\s+/u).length >= MIN_TITLE_WORDS_KEPT ? cut : limit
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
      // "escriu en català" i no només "català": la marca ha de ser una ordre,
      // no una etiqueta que es pugui llegir com "aquesta peça és catalana".
      const lang = `escriu en ${LANG_NAMES[it.outputLanguage || it.language] || 'català'}`
      const type = typeLabels[it.editorialFormat] || typeLabels.constructive
      const title = String(it.title || '').replace(/\s+/g, ' ').slice(0, 160)
      // El context de la font s'aporta NOMÉS com a material factual intern; el
      // model l'ha de reescriure i el camp s'elimina abans de publicar.
      const context = String(it.sourceContext || it.summary || '')
        .replace(/\s+/g, ' ')
        .slice(0, 1400)
      const font = String(it.source || '').replace(/\s+/g, ' ').trim()
      const marca = font
        ? `[${lang}; ${type}; font: ${font}]`
        : `[${lang}; ${type}]`
      return context
        ? `${i + 1}. ${marca} ${title}\n   context: ${context}`
        : `${i + 1}. ${marca} ${title}`
    })
    .join('\n')
  const out = await runTextModel(env, {
    system: REWRITE_SYSTEM,
    user: `Notícies:\n${list}`,
    // Cinc peces amb cossos de fins a 150 paraules en català o castellà van
    // justes amb 3.600: si la resposta es talla, les ÚLTIMES del lot es queden
    // sense cos i la peça es perd. Marge ampli, que no costa res si no s'usa.
    maxTokens: 4800,
  })
  const text = String(out?.response || '')
  const parsed = parseOwnContentBatch(text, items.length)
  // Diagnòstic: quan el model no torna cos per a alguna peça del lot, deixem
  // constància de quantes en falten i de com de llarga ha estat la resposta.
  // Sense això, una peça sense text era indistingible d'una peça mal escrita.
  const senseCos = parsed.filter((p) => !p?.body).length
  if (senseCos > 0) {
    console.warn(
      JSON.stringify({
        event: 'editorial.rewrite.incomplete',
        demanades: items.length,
        senseCos,
        caracters: text.length,
        acabament: text.slice(-80),
      }),
    )
  }
  return parsed
}

// Una línia de camp: "1 cos: ...", "1. cos: ...", "**cos**: ..." o simplement
// "cos: ...". El número és OPCIONAL a propòsit.
//
// També s'accepta que el model repeteixi la marca de l'entrada abans del nom
// del camp: "1. [escriu en català] titular: …". Sense això es perdien TOTS els
// camps d'aquella peça i quedava sense text — una peça bona perduda per una
// floritura del model.
const FIELD_LINE =
  /^[\s*#>–—-]*(?:(\d{1,2})\s*[.)]?\s*)?(?:\[[^\]]*\]\s*)?\**\s*(titular|cos|impacte|imatge)\**\s*[:–-]\s*\**\s*(.*?)\**\s*$/i

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
    const cached = await Promise.all(entries.map((e) => kv.get(cacheKeyFor(e.story, e.id))))
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
          // `outputLanguage` és la llengua en què s'ha d'ESCRIURE; `language`
          // és la de la font. Aquí només es passava la segona, i com que
          // aiOwnContentBatch fa `outputLanguage || language`, el model rebia
          // literalment "[escriu en anglès]" mentre el sistema li deia que
          // escrivís en català. Dues ordres contràries: d'aquí venia que unes
          // vegades sortís en català i altres en anglès.
          group.map((e) => ({
            title: e.story.title,
            language: e.story.language,
            outputLanguage: e.story.outputLanguage,
            editorialFormat: e.story.editorialFormat,
            summary: e.story.summary,
            sourceContext: e.story.sourceContext,
            // La FONT i el CIRCUIT també, o el redactor no sap de qui és la
            // feina que explica. Sense això, una peça del MIT Technology
            // Review va sortir dient "Quan vam preguntar als joves…", com si
            // l'entrevista l'haguéssim feta nosaltres.
            source: e.story.source,
            circuit: e.story.circuit || e.story.sourceCircuit,
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
              ? kv.put(cacheKeyFor(e.story, e.id), JSON.stringify(e.own), { expirationTtl: CACHE_TTL_SECONDS })
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
    // Escurçat just abans de publicar: la peça no es perd mai per un titular
    // llarg, i el que arriba a la portada sempre té una llargada de titular.
    const title = shortenTitle(own.title || genericTitle(e.story))
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
      // Només Circuit A pot conservar la imatge institucional. Sempre passa
      // imageRules; Circuit B usa inevitablement la il·lustració pròpia.
      imageUrl:
        e.story.circuit === 'A' && hasVerifiedImageRights(e.story)
          ? e.story.imageUrl
          : imageUrl,
      imageAlt:
        e.story.circuit === 'A' && hasVerifiedImageRights(e.story)
          ? e.story.imageAlt
          : `Il·lustració editorial de la notícia: ${title}`,
      imageCredit:
        e.story.circuit === 'A' && hasVerifiedImageRights(e.story)
          ? e.story.imageCredit
          : 'El Bon Diari (il·lustració IA)',
      imageAttributionUrl:
        e.story.circuit === 'A' && hasVerifiedImageRights(e.story)
          ? e.story.imageAttributionUrl
          : '',
      ...(e.story.circuit === 'A' && hasVerifiedImageRights(e.story)
        ? { imageRights: e.story.imageRights }
        : { imageRights: undefined }),
      language: e.story.outputLanguage || e.story.language,
      ownContent: hasOwnContent,
    }
  })
}
