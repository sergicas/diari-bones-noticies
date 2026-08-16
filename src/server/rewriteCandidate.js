import { runTextModel } from './ai/textModel.js'
import { dadesSenseSuport } from './editorAssistant.js'
import { parseOwnContentBatch } from './storyText.js'

// TORNAR A ESCRIURE UNA PEÇA, EN LLOC DE PERDRE-LA.
//
// Quan una candidata arriba a la sala amb el català espatllat —«predissen» per
// «prediuen», «balenes de finlandes» per «rorquals comuns»—, fins ara només hi
// havia dues sortides: aprovar-la amb la falta o descartar-la. I descartar-la
// és la sortida equivocada: la peça no té cap culpa que la nostra màquina
// escrigui malament. Aquest mòdul és la tercera sortida.
//
// DUES REGLES QUE NO ES PODEN SALTAR:
//
// 1. NO S'AFEGEIX CAP DADA. Es reescriu el que ja tenim, no es torna a la
//    font. Per això la guàrdia de fets compara el text NOU amb el VELL: si a
//    la reescriptura hi apareix una xifra o un nom propi que abans no hi era,
//    la màquina se l'ha inventat i la reescriptura es llença.
// 2. LA PEÇA NO ES PUBLICA. Segueix esperant que una persona la llegeixi,
//    exactament igual que abans. Això només canvia com està escrita.

const SISTEMA = [
  'Ets el corrector d\'un diari en català. Reps una peça escrita per una màquina',
  'i la tornes a escriure BEN ESCRITA en català.',
  '',
  'REGLES:',
  '- Català correcte i natural. Vigila especialment les formes verbals inventades',
  '  («predissen» no existeix: és «prediuen»), els accents i els calcs de l\'anglès.',
  '- Les traduccions mal fetes de noms d\'animals, institucions o llocs, corregeix-les',
  '  («fin whales» són «rorquals comuns», no «balenes de finlandes»).',
  '- NO AFEGEIXIS CAP DADA NOVA. Ni xifres, ni noms, ni institucions que no siguin',
  '  al text que reps. Si una cosa no hi és, no hi ha de ser.',
  '- El titular ha de dir EL QUE DIU EL COS. Si el titular que reps explica una',
  '  altra notícia que la del cos, escriu-ne un que s\'hi ajusti.',
  '- Mantén la llargada aproximada i el to sobri. Res d\'exclamacions ni de floritures.',
  '',
  'Respon EXACTAMENT amb aquestes tres línies i res més:',
  'titular: <el titular>',
  'cos: <el text, en un sol paràgraf>',
  'impacte: <una frase que digui per què importa>',
].join('\n')

function textDe(story) {
  return [story?.title || '', ...(story?.body || []), story?.impact || '']
    .filter(Boolean)
    .join('\n')
}

/**
 * Torna `{ ok: true, story }` amb la peça reescrita, o `{ ok: false, motiu }`.
 * Mai no llança: qui la crida ha de poder dir a la persona què ha passat.
 */
export async function reescriuCandidata(env, story) {
  const original = textDe(story)
  if (!original.trim()) return { ok: false, motiu: 'la peça no té text per reescriure' }

  let out
  try {
    out = await runTextModel(env, {
      system: SISTEMA,
      user: original,
      maxTokens: 700,
    })
  } catch (error) {
    return {
      ok: false,
      motiu: 'la màquina que escriu no respon ara mateix',
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const [nova] = parseOwnContentBatch(out?.response || '', 1)
  if (!nova?.title || !nova?.body) {
    return { ok: false, motiu: 'la resposta de la màquina no s’entén' }
  }

  // LA GUÀRDIA DE FETS, AMB EL TEXT VELL COM A FONT. Si a la reescriptura hi
  // ha una xifra o un nom propi que abans no hi era, se l'ha inventat: es
  // llença i la peça es queda com estava. Val més un titular lleig que un de
  // fals.
  const inventat = dadesSenseSuport({
    title: `${nova.title} ${nova.body} ${nova.impact || ''}`,
    reviewSourceContext: original,
  })
  if (inventat.length > 0) {
    return {
      ok: false,
      motiu: `la reescriptura afegia coses que no hi eren (${inventat.slice(0, 3).join(', ')})`,
    }
  }

  return {
    ok: true,
    story: {
      ...story,
      title: nova.title,
      body: [nova.body],
      impact: nova.impact || story.impact || '',
      // Rastre: qui llegeixi la peça després ha de saber que el text que veu
      // no és el que va sortir de la primera escriptura.
      rewrittenAt: new Date().toISOString(),
    },
    model: out?.provider ? `${out.provider}:${out.model}` : null,
  }
}
