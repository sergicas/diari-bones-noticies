// PORTA D'APROVACIÓ HUMANA
//
// El radar recull, filtra i redacta, però NO publica. Cap peça nova arriba al
// web, a l'RSS, al sitemap de notícies ni a les notificacions fins que una
// persona l'ha llegida i ha dit que sí. Aquesta és la regla prudent decidida el
// 13-08-2026, abans de desplegar el gir editorial a vuit àmbits: amb dos
// circuits de continguts (A tradueix amb llicència, B mai no republica) i una
// regla estricta d'imatges, el criteri no es pot delegar del tot al codi.
//
// No calen taules noves: `migrations/0001_editorial_core.sql` ja preveia els
// estats. Aquí els fem servir de debò.
//
//   captured  → esperant que una persona la llegeixi
//   published → aprovada a mà
//   rejected  → descartada a mà, o caducada sense que ningú la llegís
//
// Cap dels dos estats d'espera (captured, rejected) no entra a les consultes
// públiques de `editorialStore.js`, que només llegeixen published/distributed/
// archived. Per tant una peça pendent no és visible enlloc.

import { feedStoryId } from '../lib/story-id.js'

export const PENDING_STATUS = 'captured'
export const APPROVED_STATUS = 'published'
export const REJECTED_STATUS = 'rejected'

// Estats que ja són públics: si una peça hi és, va passar la porta en el seu dia.
const PUBLIC_STATUSES = new Set([APPROVED_STATUS, 'distributed', 'archived'])

// Una peça que ningú no ha llegit en set dies deixa de ser notícia. Caduca sola
// perquè la llista d'espera no es converteixi en un pantà de centenars de peces
// velles que fa mandra obrir.
export const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const MAX_STATEMENTS_PER_BATCH = 40
const STORY_DETAIL_TTL_SECONDS = 30 * 24 * 60 * 60

function database(env) {
  return env?.EDITORIAL_DB || null
}

function nowIso() {
  return new Date().toISOString()
}

function chunks(items, size = MAX_STATEMENTS_PER_BATCH) {
  const result = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

export function candidateId(story) {
  return story?.id || feedStoryId(story?.url || story?.title || '')
}

function parsePayload(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * Llegeix de la base de dades quina decisió té presa cada peça.
 * Si la base de dades no respon, torna un mapa buit: el repartidor de sota
 * entén "sense decisió" com a "no publicar", que és el costat segur.
 */
export async function readDecisions(env, ids) {
  const db = database(env)
  const unique = [...new Set((ids || []).filter(Boolean))]
  const decisions = new Map()
  if (!db || unique.length === 0) return decisions
  try {
    for (const group of chunks(unique)) {
      const placeholders = group.map(() => '?').join(', ')
      const { results } = await db
        .prepare(
          `SELECT id, editorial_status, human_decision
             FROM stories WHERE id IN (${placeholders})`,
        )
        .bind(...group)
        .all()
      for (const row of results || []) {
        decisions.set(row.id, {
          status: row.editorial_status,
          humanDecision: row.human_decision || null,
        })
      }
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'review.decisions.read-failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
  return decisions
}

/**
 * Reparteix el lot en tres: el que pot sortir, el que espera i el que s'ha
 * descartat.
 *
 * `publicUrls` són les peces que JA són al lot públic. Aquestes no es tornen a
 * jutjar: van passar la porta en el seu dia i tancar-les ara les faria
 * desaparèixer del web, trencant enllaços que Google ja té indexats. Així una
 * caiguda de la base de dades atura les novetats sense desmuntar el diari.
 */
export function splitByReviewDecision(
  stories,
  { decisions = new Map(), publicUrls = new Set() } = {},
) {
  const approved = []
  const pending = []
  const rejected = []
  for (const story of stories || []) {
    if (publicUrls.has(story?.url)) {
      approved.push(story)
      continue
    }
    const decision = decisions.get(candidateId(story))
    const status = decision?.status
    // NO N'HI HA PROU AMB L'ESTAT PÚBLIC (14-08-2026).
    //
    // D1 porta 209 peces publicades per l'automatisme ANTERIOR, d'abans que
    // existís cap revisió humana. Donant per bona qualsevol fila amb estat
    // públic, una d'aquelles reapareixia a portada sola: el sistema no sabia
    // distingir "ho va aprovar una persona" de "ho va publicar el robot vell".
    //
    // Ara cal la marca explícita. Les peces velles tenen human_decision a NULL
    // i, per tant, tornen a revisió si mai reapareixen. Val més fer llegir dues
    // vegades una peça bona que publicar-ne una que ningú no ha llegit mai.
    if (PUBLIC_STATUSES.has(status) && decision?.humanDecision === 'approve') {
      approved.push(story)
    } else if (status === REJECTED_STATUS) {
      rejected.push(story)
    } else {
      pending.push(story)
    }
  }
  return { approved, pending, rejected }
}

/**
 * Desa les peces noves a la sala d'espera. `INSERT OR IGNORE` fa que mai no
 * trepitgi una decisió ja presa: si la peça ja hi és (aprovada o descartada),
 * es queda com estava.
 */
export async function recordPendingCandidates(env, stories) {
  const db = database(env)
  const list = (stories || []).filter((story) => story?.url && story?.title)
  if (!db || list.length === 0) return { recorded: 0 }
  const timestamp = nowIso()
  let recorded = 0
  try {
    for (const group of chunks(list)) {
      const statements = group.map((story) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO stories (
              id, url, title, source, section, language, editorial_status,
              published_at, payload_json, first_seen_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, '${PENDING_STATUS}', NULL, ?, ?, ?)`,
          )
          .bind(
            candidateId(story),
            story.url,
            story.title,
            story.source || null,
            story.category || null,
            story.language || 'ca',
            JSON.stringify(story),
            story.firstSeenAt || timestamp,
            timestamp,
          ),
      )
      const outcome = await db.batch(statements)
      for (const item of outcome || []) {
        recorded += Number(item?.meta?.changes || 0)
      }
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'review.pending.write-failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
  return { recorded }
}

/** Les peces que esperen ser llegides, de la més nova a la més vella. */
export async function listPendingCandidates(env, { limit = 200 } = {}) {
  const db = database(env)
  if (!db) return []
  try {
    const { results } = await db
      .prepare(
        `SELECT id, payload_json, first_seen_at
           FROM stories
          WHERE editorial_status = '${PENDING_STATUS}'
          ORDER BY first_seen_at DESC
          LIMIT ?`,
      )
      .bind(Math.max(1, Math.min(500, Number(limit) || 200)))
      .all()
    return (results || [])
      .map((row) => {
        const story = parsePayload(row.payload_json)
        if (!story) return null
        return { ...story, id: row.id, pendingSince: row.first_seen_at }
      })
      .filter(Boolean)
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'review.pending.read-failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return []
  }
}

/** Quantes n'hi ha esperant (per a l'avís del matí). */
export async function countPendingCandidates(env) {
  const db = database(env)
  if (!db) return 0
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS total FROM stories WHERE editorial_status = '${PENDING_STATUS}'`,
      )
      .first()
    return Number(row?.total || 0)
  } catch {
    return 0
  }
}

/**
 * Afegeix una peça acabada d'aprovar al lot públic i li desa la pàgina de
 * detall. Sense això, aprovar-la no es notaria fins al pròxim refresc (fins a
 * dotze hores després) i la revisió semblaria que no fa res.
 */
const LIVE_EDITION_ATTEMPTS = 3

/**
 * Afegeix la peça al lot públic i CONFIRMA que hi ha quedat.
 *
 * El `get` + `put` de sempre perdia actualitzacions: dues peces aprovades
 * alhora llegien la mateixa edició, cadascuna hi afegia la seva i la segona
 * escriptura esborrava la primera. Les dues deien "publicada" i a la portada
 * només n'hi havia una.
 *
 * Rellegint i reintentant, el cas convergeix: qui es troba que no hi és, hi
 * torna a entrar sobre l'edició ja actualitzada. KV té consistència eventual,
 * així que una relectura pot sortir endarrerida; per això es reintenta unes
 * quantes vegades i, si tot i així no es confirma, es prefereix dir que NO
 * s'ha publicat (la peça torna a la sala) abans que dir que sí sense saber-ho.
 */
async function addToLiveEdition(kv, story) {
  for (let attempt = 0; attempt < LIVE_EDITION_ATTEMPTS; attempt += 1) {
    const cached = await kv.get('latest', 'json')
    const stories = Array.isArray(cached?.stories) ? cached.stories : []
    if (stories.some((item) => item.url === story.url)) return true
    await kv.put(
      'latest',
      JSON.stringify({
        ...(cached || {}),
        updatedAt: cached?.updatedAt || nowIso(),
        stories: [story, ...stories],
      }),
    )
    const after = await kv.get('latest', 'json')
    if ((after?.stories || []).some((item) => item.url === story.url)) return true
  }
  return false
}

/**
 * Desfà una publicació a mitges. La còpia de detall és la part MÉS delicada:
 * `findStory` mira KV abans que D1, així que una clau `story:<id>` òrfena
 * deixaria l'esborrany accessible per /noticia/:id encara que la base de
 * dades el tornés a marcar com a pendent. Seria reobrir per un costat el
 * forat que s'acaba de tapar per l'altre.
 */
async function undoLivePublication(kv, id, url) {
  try {
    await kv.delete(`story:${id}`)
  } catch {
    // Continuem: encara hem de treure-la del lot públic.
  }
  try {
    const cached = await kv.get('latest', 'json')
    const stories = Array.isArray(cached?.stories) ? cached.stories : []
    if (stories.some((item) => item.url === url)) {
      await kv.put(
        'latest',
        JSON.stringify({
          ...(cached || {}),
          stories: stories.filter((item) => item.url !== url),
        }),
      )
    }
  } catch (error) {
    // Si això falla, la peça pot quedar visible tot i tornar a la sala. Es
    // deixa constància perquè es pugui arreglar a mà; el pròxim refresc també
    // la reescriurà a partir del que hi hagi aprovat.
    console.error(
      JSON.stringify({
        event: 'review.publish.undo-failed',
        id,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

async function pushApprovedStoryLive(env, story) {
  const kv = env?.LIVE_NEWS_KV
  const id = candidateId(story)
  if (!kv || !story?.url || !id) return { live: false }
  try {
    // La pàgina de detall PRIMER. Si després falla el lot, la peça encara no
    // és enlloc de cara al lector, i el desfer la treu del tot. A l'inrevés
    // (lot primer) una peça podia quedar a portada sense pàgina pròpia.
    await kv.put(`story:${id}`, JSON.stringify(story), {
      expirationTtl: STORY_DETAIL_TTL_SECONDS,
    })
    if (!(await addToLiveEdition(kv, story))) {
      throw new Error('live-edition-not-confirmed')
    }
    return { live: true }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'review.publish.kv-failed',
        id,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    await undoLivePublication(kv, id, story.url)
    return { live: false }
  }
}

/**
 * La decisió d'una persona sobre una peça concreta.
 * Només actua sobre peces que encara esperen: no es pot despublicar per aquí.
 */
export async function decideCandidate(env, id, decision) {
  const db = database(env)
  if (!db) return { ok: false, error: 'no-database' }
  if (decision !== 'approve' && decision !== 'reject') {
    return { ok: false, error: 'unknown-decision' }
  }
  const timestamp = nowIso()
  const status = decision === 'approve' ? APPROVED_STATUS : REJECTED_STATUS
  try {
    const row = await db
      .prepare(
        `SELECT payload_json FROM stories WHERE id = ? AND editorial_status = '${PENDING_STATUS}'`,
      )
      .bind(id)
      .first()
    if (!row) return { ok: false, error: 'not-pending' }
    // PRIMER ES RESERVA LA PEÇA, I NOMÉS SI LA RESERVA PROSPERA ES PUBLICA.
    //
    // La condició `editorial_status = 'captured'` fa d'exclusió mútua: si dues
    // decisions arriben alhora (dues pestanyes, dos aparells), només una canvia
    // la fila i l'altra veu changes = 0. Sense mirar `changes`, la segona diria
    // "Publicada" havent-la potser descartada la primera.
    const reserva = await db
      .prepare(
        `UPDATE stories
            SET editorial_status = ?, published_at = ?, updated_at = ?,
                human_reviewed_at = ?, human_decision = ?
          WHERE id = ? AND editorial_status = '${PENDING_STATUS}'`,
      )
      .bind(
        status,
        decision === 'approve' ? timestamp : null,
        timestamp,
        timestamp,
        decision,
        id,
      )
      .run()
    if (Number(reserva?.meta?.changes || 0) === 0) {
      return { ok: false, error: 'not-pending' }
    }

    if (decision !== 'approve') return { ok: true, id, decision, live: false }

    const story = parsePayload(row.payload_json)
    const live = story
      ? await pushApprovedStoryLive(env, {
          ...story,
          id,
          publishedAt: story.publishedAt || timestamp,
        })
      : { live: false }

    // TOT O RES. Si la peça no arriba al web, es desfà la reserva i torna a la
    // sala. Deixar-la marcada com a publicada seria pitjor que no fer res: la
    // pantalla diria que sí, la peça no sortiria enlloc, i ja no es podria
    // tornar a aprovar perquè constaria com a decidida.
    if (!live.live) {
      await db
        .prepare(
          `UPDATE stories
              SET editorial_status = '${PENDING_STATUS}', published_at = NULL,
                  updated_at = ?, human_reviewed_at = NULL, human_decision = NULL
            WHERE id = ?`,
        )
        .bind(nowIso(), id)
        .run()
      console.error(
        JSON.stringify({ event: 'review.approve.rolled-back', id }),
      )
      return { ok: false, error: 'not-published', id }
    }

    return { ok: true, id, decision, ...live }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'review.decide.failed',
        id,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return { ok: false, error: 'database-error' }
  }
}

/**
 * Les que ningú no ha llegit en set dies marxen soles. Es marquen com a
 * descartades (no esborrades) perquè quedi rastre i no tornin a proposar-se.
 */
export async function expireStaleCandidates(
  env,
  { maxAgeMs = PENDING_MAX_AGE_MS, now = Date.now() } = {},
) {
  const db = database(env)
  if (!db) return { expired: 0 }
  const cutoff = new Date(now - maxAgeMs).toISOString()
  try {
    const outcome = await db
      .prepare(
        // 'expired' i no 'reject': una peça que ha caducat no és una peça que
        // algú hagi llegit i descartat, i el registre no ho ha de confondre.
        `UPDATE stories
            SET editorial_status = '${REJECTED_STATUS}', updated_at = ?,
                human_decision = 'expired'
          WHERE editorial_status = '${PENDING_STATUS}' AND first_seen_at < ?`,
      )
      .bind(nowIso(), cutoff)
      .run()
    return { expired: Number(outcome?.meta?.changes || 0) }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'review.expire.failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return { expired: 0 }
  }
}
