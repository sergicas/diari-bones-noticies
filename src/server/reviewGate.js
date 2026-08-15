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

/**
 * Treu de la peça tot el que és material de treball intern i no s'ha de desar
 * ni publicar: la marca d'agrupació (es recalcula en llegir) i la còpia de la
 * font que fa servir l'ajudant per comprovar els fets.
 */
export function senseMaterialDeTreball(story) {
  if (!story) return story
  const {
    possibleDuplicateOf: _grup,
    reviewSourceContext: _font,
    reviewSourceTitle: _titolFont,
    ...net
  } = story
  return net
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
          `SELECT id, editorial_status, human_decision, auto_decision
             FROM stories WHERE id IN (${placeholders})`,
        )
        .bind(...group)
        .all()
      for (const row of results || []) {
        decisions.set(row.id, {
          status: row.editorial_status,
          humanDecision: row.human_decision || null,
          autoDecision: row.auto_decision || null,
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
    // Una aprovació val si l'ha donada una PERSONA o l'AJUDANT. Es guarden
    // separades a la base de dades (human_decision / auto_decision) perquè en
    // qualsevol moment se sàpiga qui va deixar passar què; però totes dues
    // publiquen. Sergi va triar que el diari sortís sol.
    const aprovada =
      decision?.humanDecision === 'approve' || decision?.autoDecision === 'approve'
    if (PUBLIC_STATUSES.has(status) && aprovada) {
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
  if (list.length === 0) return { recorded: 0 }
  // Sense base de dades i AMB candidates a desar, això és una avaria, no un
  // cas normal: tornar zero deixava el radar continuar fins a marcar-les com a
  // vistes, i les candidates es perdien sense que ningú les hagués vistes. És
  // l'últim racó on encara s'incomplia "el que no es desa, no es marca".
  if (!db) {
    throw new Error('no hi ha base de dades per desar les candidates')
  }
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
            // L'AGRUPACIÓ NO ES DESA MAI, i es garanteix AQUÍ, al punt
            // d'escriptura. Deixar-ho en mans de qui crida ja va fallar una
            // vegada: el radar li passava les peces amb la marca posada i, quan
            // la representant sortia de la sala, la seguidora apuntava a algú
            // que ja no hi era i desapareixia. Els grups es calculen en llegir.
            JSON.stringify(senseMaterialDeTreball(story)),
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
    // ES RELLANÇA (15-08-2026). Abans s'empassava l'error i es tornava
    // { recorded: 0 }; el radar ho ignorava i marcava igualment totes les
    // peces com a vistes, de manera que una avaria transitòria de D1 buidava
    // en silenci una passada sencera: candidates que ningú no veuria mai.
    //
    // Amb l'error rellançat, el radar s'atura abans de marcar res i la cua
    // reintenta la feina. Val més repetir una passada que perdre-la.
    console.error(
      JSON.stringify({
        event: 'review.pending.write-failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    throw error
  }
  return { recorded }
}

/**
 * Desa les decisions de l'AJUDANT, mai com si fossin d'una persona.
 *
 * `human_decision` no es toca des d'aquí: si un dia cal saber què va publicar
 * la màquina tota sola —per auditar-ho, per revisar-ho o per desfer-ho—, la
 * consulta és immediata. Només actua sobre peces que encara esperen: una
 * decisió humana ja presa no la pot trepitjar cap automatisme.
 */
export async function recordAssistantDecisions(env, decisions) {
  const db = database(env)
  const llista = (decisions || []).filter((d) => d?.id && d?.decision)
  if (llista.length === 0) return { approved: 0, rejected: 0 }
  if (!db) throw new Error('no hi ha base de dades per desar les decisions')
  const timestamp = nowIso()
  let approved = 0
  let rejected = 0
  // Els IDs que D1 ha acceptat DE DEBÒ. Publicar els proposats i no aquests
  // permetia que una peça que una persona acabava de rebutjar entrés igualment
  // al lot: l'UPDATE no canviava res (changes = 0) i ningú ho mirava.
  const aplicats = []
  for (const group of chunks(llista)) {
    const statements = group.map((d) => {
      const publica = d.decision === 'approve'
      return db
        .prepare(
          `UPDATE stories
              SET editorial_status = ?, published_at = ?, updated_at = ?,
                  auto_decision = ?, auto_reason = ?, auto_decided_at = ?,
                  live_state = ?
            WHERE id = ? AND editorial_status = '${PENDING_STATUS}'`,
        )
        .bind(
          publica ? APPROVED_STATUS : REJECTED_STATUS,
          publica ? timestamp : null,
          timestamp,
          d.decision,
          String(d.reason || '').slice(0, 300),
          timestamp,
          publica ? 'pending' : null,
          d.id,
        )
    })
    const outcome = await db.batch(statements)
    outcome.forEach((item, i) => {
      if (Number(item?.meta?.changes || 0) === 0) return
      aplicats.push(group[i].id)
      if (group[i].decision === 'approve') approved += 1
      else rejected += 1
    })
  }
  return { approved, rejected, aplicats }
}

/** El que ha decidit l'ajudant i encara no ha revisat cap persona. */
export async function listAssistantDecisions(env, { limit = 60 } = {}) {
  const db = database(env)
  if (!db) return []
  try {
    const { results } = await db
      .prepare(
        `SELECT id, payload_json, auto_decision, auto_reason, auto_decided_at
           FROM stories
          WHERE auto_decision IS NOT NULL AND human_decision IS NULL
          ORDER BY auto_decided_at DESC LIMIT ?`,
      )
      .bind(Math.max(1, Math.min(200, Number(limit) || 60)))
      .all()
    return (results || [])
      .map((row) => {
        const story = parsePayload(row.payload_json)
        if (!story) return null
        return {
          ...story,
          id: row.id,
          autoDecision: row.auto_decision,
          autoReason: row.auto_reason || '',
          autoDecidedAt: row.auto_decided_at,
        }
      })
      .filter(Boolean)
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'review.assistant-list.failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return []
  }
}

/**
 * Peces que una persona ha manat retirar i que el radar encara no ha tret.
 *
 * És una ORDRE DURABLE, no una escriptura. La sala no toca mai KV: si ho fes,
 * hi hauria dos escriptors del lot públic —el radar i cada petició HTTP de
 * revisió— i es trepitjarien, perquè KV no té operacions atòmiques de
 * llegir-modificar-escriure i `max_concurrency: 1` només serialitza la cua.
 */
export async function pendingWithdrawals(env) {
  const db = database(env)
  if (!db) return []
  try {
    const { results } = await db
      .prepare(
        `SELECT id, url FROM stories WHERE withdrawal = 'pending' LIMIT 100`,
      )
      .all()
    return results || []
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'review.withdrawals.read-failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return []
  }
}

/** Marca com a retirades les que el radar ja ha tret del web de debò. */
export async function markWithdrawn(env, ids) {
  const db = database(env)
  const llista = [...new Set((ids || []).filter(Boolean))]
  if (!db || llista.length === 0) return { marked: 0 }
  let marked = 0
  for (const group of chunks(llista)) {
    const placeholders = group.map(() => '?').join(', ')
    const outcome = await db
      .prepare(
        `UPDATE stories SET withdrawal = 'withdrawn', updated_at = ?
          WHERE id IN (${placeholders}) AND withdrawal = 'pending'`,
      )
      .bind(nowIso(), ...group)
      .run()
    marked += Number(outcome?.meta?.changes || 0)
  }
  return { marked }
}

/**
 * VETO DURABLE: peces que no s'han de servir encara que siguin a KV.
 *
 * `findStory` mira KV abans que D1. Sense aquest veto, una peça retirada que
 * encara tingués la còpia `story:<id>` seguiria sent pública fins que el radar
 * la tragués, i les lectures no en sabrien res.
 */
export async function isWithdrawn(env, id) {
  const db = database(env)
  if (!db || !id) return false
  try {
    const row = await db
      .prepare(
        `SELECT 1 AS hi FROM stories
          WHERE id = ? AND withdrawal IN ('pending', 'withdrawn') LIMIT 1`,
      )
      .bind(id)
      .first()
    return Boolean(row?.hi)
  } catch (error) {
    // FALLA TANCAT. Tornar `false` quan D1 no respon deixava reaparèixer
    // justament la peça que algú havia manat retirar: el veto ha de valer
    // sobretot quan les coses van malament. Qui crida ha de respondre que la
    // pàgina no està disponible, no servir la còpia de KV.
    const avaria = new Error('no es pot comprovar si la peça està retirada')
    avaria.name = 'WithdrawalCheckUnavailable'
    avaria.cause = error
    throw avaria
  }
}

/**
 * Desa el que l'ajudant HAURIA fet, sense fer-ho.
 *
 * En ombra no decideix res, però l'opinió s'ha de poder contrastar després amb
 * la decisió humana de la mateixa peça. Amb recomptes al registre no n'hi ha
 * prou: passats uns dies no hi hauria manera d'avaluar si encerta.
 */
export async function recordShadowVerdicts(env, verdicts, { version = '' } = {}) {
  const db = database(env)
  const llista = (verdicts || []).filter((v) => v?.id && v?.decision)
  if (!db || llista.length === 0) return { recorded: 0 }
  const timestamp = nowIso()
  let recorded = 0
  for (const group of chunks(llista)) {
    const statements = group.map((v) =>
      db
        .prepare(
          `UPDATE stories
              SET shadow_decision = ?, shadow_reason = ?, shadow_at = ?,
                  shadow_version = ?
            WHERE id = ?`,
        )
        .bind(v.decision, String(v.reason || '').slice(0, 300), timestamp, version, v.id),
    )
    const outcome = await db.batch(statements)
    for (const item of outcome || []) recorded += Number(item?.meta?.changes || 0)
  }
  return { recorded }
}

/** Les decisions que ha pres una PERSONA, per ensenyar-li'n el criteri a l'ajudant. */
export async function humanDecisionExamples(env, { limit = 40 } = {}) {
  const db = database(env)
  if (!db) return []
  try {
    const { results } = await db
      .prepare(
        `SELECT title, human_decision FROM stories
          WHERE human_decision IN ('approve', 'reject')
          ORDER BY human_reviewed_at DESC LIMIT ?`,
      )
      .bind(Math.max(1, Math.min(100, Number(limit) || 40)))
      .all()
    return (results || []).map((row) => ({
      title: row.title,
      decision: row.human_decision,
    }))
  } catch {
    return []
  }
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
/**
 * Desa la còpia de detall de cada peça (la pàgina /noticia/:id).
 *
 * Viu aquí perquè el RADAR la cridi: la sala de revisió no escriu mai a KV.
 * Vegeu decideCandidate.
 */
export async function persistStoryDetails(kv, stories) {
  const desades = new Set()
  if (!kv || !Array.isArray(stories) || stories.length === 0) return desades
  for (const story of stories) {
    const id = candidateId(story)
    if (!id) continue
    try {
      await kv.put(`story:${id}`, JSON.stringify(story), {
        expirationTtl: STORY_DETAIL_TTL_SECONDS,
      })
      desades.add(id)
    } catch (error) {
      // Torna QUINES s'han desat, no quantes. Abans això s'empassava l'error i
      // qui cridava marcava igualment totes les peces com a publicades, encara
      // que alguna s'hagués quedat sense pàgina de detall.
      console.warn(
        JSON.stringify({
          event: 'review.detail.write-failed',
          id,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }
  return desades
}

/** Quantes aprovades esperen sortir al web (per ensenyar-ho a la sala). */
export async function countPendingLive(env) {
  const db = database(env)
  if (!db) return 0
  try {
    const row = await db
      .prepare(
        // També les de l'ajudant: si no, la sala amagaria aprovacions
        // automàtiques que encara esperen sortir.
        `SELECT COUNT(*) AS total FROM stories
          WHERE live_state = 'pending'
            AND editorial_status = '${APPROVED_STATUS}'
            AND (human_decision = 'approve' OR auto_decision = 'approve')`,
      )
      .first()
    return Number(row?.total || 0)
  } catch {
    return 0
  }
}

/**
 * Les peces que una persona ha aprovat i que encara no consten al web.
 *
 * El radar les recull a cada passada i les torna a posar al lot. És el
 * reintent: idempotent, sense cua nova i amb un sol escriptor del lot públic.
 */
export async function pendingLiveStories(env) {
  const db = database(env)
  if (!db) return []
  try {
    const { results } = await db
      .prepare(
        // Les aprovacions de l'AJUDANT també. Si una falla en escriure el
        // detall o el lot, quedava amb live_state='pending' i marcada com a
        // vista, i cap passada futura no la recollia: pèrdua silenciosa.
        // La precedència humana es manté: una peça que una persona hagi
        // rebutjat ja no és 'published' i per tant no entra aquí.
        `SELECT id, payload_json FROM stories
          WHERE live_state = 'pending'
            AND editorial_status = '${APPROVED_STATUS}'
            AND (human_decision = 'approve' OR auto_decision = 'approve')
            AND (human_decision IS NULL OR human_decision <> 'reject')
          ORDER BY published_at ASC LIMIT 50`,
      )
      .all()
    return (results || [])
      .map((row) => {
        const story = parsePayload(row.payload_json)
        return story ? { ...story, id: row.id } : null
      })
      .filter(Boolean)
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'review.pending-live.read-failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return []
  }
}

/** Marca com a sincronitzades les peces que ja consten al lot públic. */
export async function markStoriesLive(env, ids) {
  const db = database(env)
  const llista = [...new Set((ids || []).filter(Boolean))]
  if (!db || llista.length === 0) return { marked: 0 }
  try {
    let marked = 0
    for (const group of chunks(llista)) {
      const placeholders = group.map(() => '?').join(', ')
      const outcome = await db
        .prepare(
          `UPDATE stories SET live_state = 'live', updated_at = ?
            WHERE id IN (${placeholders}) AND live_state = 'pending'`,
        )
        .bind(nowIso(), ...group)
        .run()
      marked += Number(outcome?.meta?.changes || 0)
    }
    return { marked }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'review.mark-live.failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return { marked: 0 }
  }
}

/**
 * La decisió d'una persona sobre una peça concreta.
 *
 * REGLA (14-08-2026, després de la tercera revisió de Codex): una aprovació
 * humana NO es desfà mai. Abans, si la peça no es podia confirmar al web,
 * s'anul·lava l'aprovació i tornava a la sala. Semblava prudent i era just al
 * revés: KV té consistència eventual, així que "no ho he pogut confirmar" no
 * vol dir "no s'ha publicat". Una lectura endarrerida podia fer que una peça
 * aprovada tornés a constar com a esborrany mentre continuava sent pública
 * —exactament la inversió que aquesta porta ha d'evitar.
 *
 * Ara la decisió és definitiva a D1 i el que té estat és la SINCRONIA amb el
 * web: pending o live. El que queda pendent ho recull el radar a la pròxima
 * passada, i la sala ho diu clarament en lloc d'assegurar una cosa que no sap.
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
    // Una persona pot decidir sobre una peça que espera, i TAMBÉ esmenar el
    // que hagi decidit l'ajudant mentre cap persona no hi hagi dit la seva.
    // Sense això, l'automatisme seria irreversible.
    const row = await db
      .prepare(
        `SELECT payload_json, url, auto_decision FROM stories
          WHERE id = ? AND (
            editorial_status = '${PENDING_STATUS}'
            OR (auto_decision IS NOT NULL AND human_decision IS NULL)
          )`,
      )
      .bind(id)
      .first()
    if (!row) return { ok: false, error: 'not-pending' }
    const esmenaAjudant = Boolean(row.auto_decision)

    // La condició fa d'exclusió mútua entre dues decisions simultànies sobre
    // la MATEIXA peça: només una canvia la fila, i l'altra veu changes = 0.
    // LA DECISIÓ I L'ORDRE DE RETIRADA VAN JUNTES, en un sol UPDATE.
    //
    // Fer-ho en dues consultes deixava un forat: si la segona fallava, la peça
    // quedava rebutjada però sense ordre de retirar-la, i un segon intent ja no
    // la podia recuperar perquè `human_decision` ja estava informat. La peça es
    // quedava rebutjada i pública alhora.
    const calRetirar = esmenaAjudant && decision === 'reject'
    const reserva = await db
      .prepare(
        `UPDATE stories
            SET editorial_status = ?, published_at = ?, updated_at = ?,
                human_reviewed_at = ?, human_decision = ?, live_state = ?,
                withdrawal = ?
          WHERE id = ? AND (
            editorial_status = '${PENDING_STATUS}'
            OR (auto_decision IS NOT NULL AND human_decision IS NULL)
          )`,
      )
      .bind(
        status,
        decision === 'approve' ? timestamp : null,
        timestamp,
        timestamp,
        decision,
        decision === 'approve' ? 'pending' : null,
        calRetirar ? 'pending' : null,
        id,
      )
      .run()
    if (Number(reserva?.meta?.changes || 0) === 0) {
      return { ok: false, error: 'not-pending' }
    }


    // I AQUÍ S'ACABA. Aprovar només toca D1.
    //
    // Abans, aprovar escrivia també al lot públic per fer-ho aparèixer de
    // seguida. Semblava una comoditat i era un segon escriptor: dues
    // aprovacions alhora llegien la mateixa edició i una es perdia, tot i que
    // totes dues deien que s'havien publicat. El radar és l'ÚNIC que escriu el
    // lot; la sala només registra decisions.
    return { ok: true, id, decision, live: false }
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
