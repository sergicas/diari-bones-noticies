import { revisaCandidata, SHADOW_VERSION } from './editorAssistant.js'
import {
  candidateId,
  humanDecisionExamples,
  recordAssistantDecisions,
  recordShadowVerdicts,
} from './reviewGate.js'

// LA PASSADA DE L'AJUDANT DE REDACCIÓ.
//
// Sergi va demanar que el diari es publiqués sol. L'ajudant revisa cada
// candidata amb el seu criteri —amb les decisions reals d'ell com a exemples—
// i amb unes guàrdies que manen sobre qualsevol veredicte: cap xifra ni nom
// propi que no sigui a la font, i res de matèries delicades.
//
// El que aprova entra al lot d'aquesta mateixa passada; el que descarta queda
// desat amb el motiu i visible a la sala; el que dubta espera una persona. Res
// del que fa desapareix sense rastre, i mai no escriu a `human_decision`:
// sempre se sabrà qui va deixar passar cada peça.
//
// Viu fora de `liveNews.js` perquè es pugui provar sol. Dins del radar només
// es podia exercitar muntant fonts, IA i lot públic, i el codi que decideix si
// una peça es publica sense que ningú la miri no pot ser el menys provat.

export const MODES = Object.freeze(['off', 'shadow', 'auto'])

/**
 * Quin mode s'aplica de debò. FALLA TANCAT: només el valor exacte `auto`
 * deixa decidir la màquina. Qualsevol altre —una errada de picatge, una
 * variable buida, un `true`— es queda en ombra i es queixa al registre, perquè
 * una errada de configuració no pot obrir el diari tota sola.
 */
export function resolMode(env) {
  // Sense retallar espais a propòsit: el valor ha de ser EXACTAMENT un dels
  // tres. Un "auto " amb un espai és una configuració que ningú no ha escrit
  // amb intenció, i en cas de dubte el diari no es publica sol.
  const demanat = String(env?.ASSISTANT_MODE ?? 'shadow')
  if (MODES.includes(demanat)) return demanat
  console.error(
    JSON.stringify({ event: 'assistant.mode.invalid', valor: demanat, s_aplica: 'shadow' }),
  )
  return 'shadow'
}

// L'IDENTIFICADOR ÉS EL DE LA SALA, SEMPRE.
//
// Aquest mòdul en calculava un de propi (`story.id || story.url`). Les peces
// reals dels feeds NO porten `id`, i la sala les desa amb `candidateId`, que
// en fabrica un de la forma `feed-…`. Resultat: tots els UPDATE apuntaven a
// una fila inexistent, no es desava cap veredicte i, en automàtic, no
// s'aprovava mai res —mentre el registre deia que sí. Les proves no ho veien
// perquè hi posaven l'`id` a mà.

/**
 * Revisa les candidates d'aquesta passada.
 *
 * Torna `{ mode, aprovades }`, on `aprovades` són NOMÉS les peces que D1 ha
 * acceptat de debò: publicar les proposades feia que una peça que una persona
 * acabava de rebutjar entrés igualment al lot.
 */
export async function passadaDeLAjudant(env, candidates = []) {
  const mode = resolMode(env)
  if (!env || mode === 'off' || candidates.length === 0) return { mode, aprovades: [] }

  try {
    const exemples = await humanDecisionExamples(env)
    const tots = []
    for (const story of candidates) {
      const r = await revisaCandidata(env, story, { exemples })
      const decision =
        r.veredicte === 'publicar' ? 'approve' : r.veredicte === 'descartar' ? 'reject' : 'doubt'
      tots.push({
        id: candidateId(story),
        decision,
        reason: r.guardia ? `[${r.guardia}] ${r.motiu}` : r.motiu,
        story,
        // Per candidata, no per lot: el que ho ha decidit de debò. Quan atura
        // una guàrdia no hi ha model, i es diu així.
        version: `${SHADOW_VERSION}·${r.model || `guardia:${r.guardia || 'cap'}`}`,
      })
    }

    // MODE OMBRA: pensa i deixa constància, però no toca res. És el mode per
    // defecte i amb el que ha de començar: primer es comprova durant uns dies
    // que encerta el que hauria decidit una persona, i només llavors se li
    // dona la mà.
    if (mode !== 'auto') {
      // Es desa el veredicte de CADA candidata, dubtes inclosos, i no cinc
      // exemples al registre: sense això, passats uns dies no hi ha manera de
      // comparar el criteri de la màquina amb el d'ell, i la prova no serveix.
      // Cada veredicte porta la seva versió i el seu model (vegeu més amunt):
      // preguntar quin proveïdor s'està fent servir en acabar el lot etiquetava
      // malament els veredictes quan Gemini havia fallat a mig camí.
      await recordShadowVerdicts(env, tots, { version: SHADOW_VERSION })
      console.log(
        JSON.stringify({
          event: 'assistant.shadow',
          hauriaPublicat: tots.filter((v) => v.decision === 'approve').length,
          hauriaDescartat: tots.filter((v) => v.decision === 'reject').length,
          enDubte: tots.filter((v) => v.decision === 'doubt').length,
          versio: SHADOW_VERSION,
        }),
      )
      return { mode, aprovades: [] }
    }

    const decidides = tots.filter((v) => v.decision !== 'doubt')
    if (decidides.length === 0) return { mode, aprovades: [] }

    const outcome = await recordAssistantDecisions(env, decidides)
    const acceptades = new Set(outcome.aplicats || [])
    const aprovades = decidides
      .filter((v) => v.decision === 'approve' && acceptades.has(v.id))
      .map((v) => v.story)
    console.log(
      JSON.stringify({
        event: 'assistant.decided',
        aprovades: outcome.approved,
        descartades: outcome.rejected,
        enDubte: tots.filter((v) => v.decision === 'doubt').length,
      }),
    )
    return { mode, aprovades }
  } catch (error) {
    // Si l'ajudant falla, no passa res greu: les peces es queden esperant una
    // persona, que és el comportament d'abans que existís.
    console.warn(
      JSON.stringify({
        event: 'assistant.failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return { mode, aprovades: [] }
  }
}
