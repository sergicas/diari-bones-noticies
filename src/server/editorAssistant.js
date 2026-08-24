// L'AJUDANT DE REDACCIÓ
//
// Decideix sol què es publica, perquè la revisió diària deixi de ser una
// obligació. Sergi ho va demanar sabent el que compra: hi haurà peces al diari
// que ningú no haurà llegit abans.
//
// Per fer-ho amb cara i ulls, l'ajudant treballa amb capes, i les guàrdies
// MANEN sobre el criteri de l'IA:
//
//   1. La guàrdia de fets. Si el titular diu una xifra o un nom propi que no és
//      a la font, no s'aprova sola. Passi el que passi.
//   2. La guàrdia de termes clínics. Si la peça anomena una malaltia o un
//      tractament que la font no anomena, no s'aprova sola.
//   3. Els àmbits sensibles. DESACTIVABLE amb `ASSISTANT_SCOPE` (vegeu més
//      avall): quan l'abast és `all`, aquesta capa no s'aplica.
//   4. El criteri editorial, jutjat amb IA a partir de les decisions REALS que
//      ha anat prenent Sergi. No una llista de regles inventades: els seus sís
//      i els seus nos.
//
// El cas que justifica tot això és real. El 14-08-2026 va arribar a la sala una
// peça que deia "l'FDA aprova un tractament per a la leucèmia de cèl·lules
// plasmàtiques" quan la font parlava de mieloma múltiple: dos diagnòstics
// diferents. Ningú no ho hauria vist llegint només la peça.
//
// LA CAPA 3 JA NO HI ÉS A PRODUCCIÓ. El 17-08-2026 Sergi va decidir, amb
// l'advertència d'aquest cas al davant i per escrit, que no vol aprovació
// humana en CAP àmbit, salut i medicina incloses. És el seu diari i la decisió
// és seva.
//
// Per això existeix ara la capa 2. La guàrdia de fets original comparava xifres
// i sigles, i aquí no n'hi havia cap d'inventada —el titular deia "FDA", que sí
// que era a la font—: el que canviava era el NOM DE LA MALALTIA, en minúscula.
// La capa 2 compara precisament això, i ho fa entre llengües aprofitant que els
// termes clínics són cognats grecollatins (myeloma/mieloma, leukemia/leucèmia).
// No substitueix una persona i no ho pretén: redueix el forat concret pel qual
// va passar l'error conegut, sense demanar-li a ningú que llegeixi res.

import { runTextModel } from './ai/textModel.js'

export const PUBLICAR = 'publicar'
export const DESCARTAR = 'descartar'
export const DUBTE = 'dubte'

// Versió del criteri. Es desa amb cada veredicte d'ombra perquè, quan es
// comparin amb les decisions humanes, se sàpiga quin ajudant les va emetre.
// Puja-la sempre que canviï el prompt o les llistes.
export const SHADOW_VERSION = 'ajudant-2026-08-17.1'

// QUÈ ES POT AUTOMATITZAR: llista POSITIVA, no de prohibicions.
//
// La primera versió era una regex de temes vetats i era massa estreta: no
// atrapava «Longevitat», ni «ketamina i depressió», ni una peça sobre menors
// amb dades escolars. Una llista de prohibicions sempre va per darrere del
// món; una d'autoritzacions falla cap al costat segur.
//
// Només aquests àmbits poden decidir-se sols. Longevitat en queda fora sencer:
// és clínic per definició.
const AMBITS_AUTOMATITZABLES = new Set([
  'Astronomia',
  'Ciència',
  'Tecnologia',
  'IA',
  'Literatura',
  'Filosofia',
  'Biotecnologia',
])

// I dins d'aquests àmbits, encara hi ha matèries que no. Són els terrenys on
// una equivocació de la màquina no és un error editorial sinó un dany: a la
// salut d'algú, a la seva intimitat o a la seva reputació.
const MATERIES_DELICADES = [
  ['salut', /\b(salut|medic|m[eè]dic|f[aà]rmac|medicament|tractament|dosi|di[aà]gnosi|diagn[oò]stic|malalt|c[aà]ncer|tumor|leuc[eè]mi|miel[oò]ma|vacun|assaig cl[íi]nic|pacient|terap|cl[íi]nic|s[íi]mptom|longevitat|envelliment|mortalitat|epid[eè]mi|virus|infecci)/i],
  ['salut mental', /\b(depressi|ansietat|psiqui[aà]tr|psic[oò]leg|psicol[oò]gic|suïcid|autol[eè]si|addicci|ketamina|antidepressiu)/i],
  ['menors i dades', /\b(menors|infants|nens|adolescents|escolar|alumn|dades personals|privacitat|ciberseguretat|filtraci[óo] de dades|contrasenya)/i],
  ['violència i desgràcies', /\b(viol[eè]nci|guerra|atemptat|assassin|mort[s]?\b|v[íi]ctim|cat[aà]strof|terratr[eè]mol|inundaci|incendi|accident)/i],
  ['justícia i reputació', /\b(delict|crim|acusaci|denúnci|jutj|judici|fiscal|sent[eè]nci|conden|frau|corrupci)/i],
  ['política i diners', /\b(elecci|partit pol[íi]tic|govern|parlament|ministr|president|llei\b|dret[s]? legal|borsa|accions|inversi[óo]|beneficis|facturaci[óo])/i],
]

/**
 * Pot decidir-se sola?
 *
 * Torna el MOTIU quan no, perquè quedi escrit a la sala per què una peça ha
 * anat a mans d'una persona.
 */
export function potDecidirSol(story, { abast = 'guarded' } = {}) {
  // ABAST `all`: no queda cap àmbit reservat a una persona. Decisió d'en Sergi
  // del 17-08-2026, presa amb l'error del mieloma escrit al davant. La llista
  // de sota es conserva sencera i provada a propòsit: tornar enrere és canviar
  // una paraula a wrangler.jsonc, no reescriure codi.
  if (abast === 'all') return { pot: true, motiu: '' }
  const ambit = story?.topic || ''
  if (!AMBITS_AUTOMATITZABLES.has(ambit)) {
    return { pot: false, motiu: `l’àmbit «${ambit || 'sense àmbit'}» no es decideix sol` }
  }
  const text = `${story?.title || ''} ${(story?.body || []).join(' ')} ${story?.impact || ''} ${story?.category || ''}`
  for (const [nom, patro] of MATERIES_DELICADES) {
    if (patro.test(text)) return { pot: false, motiu: `toca ${nom}: ho ha de mirar una persona` }
  }
  return { pot: true, motiu: '' }
}

/** Compatibilitat: la pregunta antiga, expressada amb la llista nova. */
export function esSensible(story) {
  return !potDecidirSol(story).pot
}

function normalitza(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * GUÀRDIA DE FETS, versió que de debò funciona entre llengües.
 *
 * El primer intent comparava paraules del titular CATALÀ amb una font ANGLESA
 * i, és clar, marcava com a sospitós tot el que no fos un calc: "permet",
 * "mil·lennis". Inservible.
 *
 * Es comprova només el que NO canvia en traduir-se, que és on un error fa mal:
 *   · les XIFRES (anys, quantitats, distàncies, dosis);
 *   · les SIGLES i els noms propis en majúscula (FDA, NASA, Webb, Medicare).
 *
 * Si el titular en porta una que no és a la font, la peça s'ha inventat una
 * dada i no s'aprova sola. El que no es pot comprovar així —el sentit de la
 * frase— es demana a l'IA dins de la revisió, i per als temes on un error és
 * greu hi ha la guàrdia d'àmbits sensibles, que no depèn de cap model.
 */
export function materialDeFont(story) {
  return `${story?.reviewSourceContext || story?.sourceContext || ''} ${story?.reviewSourceTitle || story?.sourceTitle || ''} ${story?.summary || ''}`.trim()
}

export function dadesSenseSuport(story) {
  const font = materialDeFont(story)
  // Sense material amb què comparar no es pot afirmar res. Qui crida ha de
  // tractar-ho com a DUBTE, no com a permís: vegeu revisaCandidata.
  if (!font.trim()) return []
  const fontNorm = normalitza(font)
  const titular = String(story?.title || '')
  const sospitoses = []

  for (const xifra of titular.match(/\d[\d.,]*/g) || []) {
    const net = xifra.replace(/[.,]$/, '')
    // Es compara la xifra nua: "1.500" i "1500" són la mateixa dada.
    const nua = net.replace(/[.,]/g, '')
    if (!fontNorm.includes(normalitza(net)) && !normalitza(font.replace(/[.,]/g, '')).includes(nua)) {
      sospitoses.push(net)
    }
  }
  // Sigles i noms propis: dues lletres o més en majúscula, o Majúscula inicial
  // enmig de la frase (els noms propis no es tradueixen).
  for (const nom of titular.match(/\b[A-ZÀ-Ú][A-ZÀ-Ú]+\b|\b[A-ZÀ-Ú][a-zà-ú]{3,}\b/g) || []) {
    if (titular.trim().startsWith(nom)) continue // la primera paraula sempre va en majúscula
    if (!fontNorm.includes(normalitza(nom))) sospitoses.push(nom)
  }
  return [...new Set(sospitoses)]
}

// GUÀRDIA DE TERMES CLÍNICS.
//
// La guàrdia de fets mira xifres i noms propis, i per això no va veure l'error
// del mieloma: "leucèmia de cèl·lules plasmàtiques" no porta cap xifra ni cap
// majúscula inventada. El que hi havia canviat era el nom de la malaltia.
//
// Comparar noms de malaltia entre el nostre català i una font anglesa sembla
// impossible, però no ho és: els termes clínics són cognats grecollatins i
// només difereixen en la grafia (myeloma/mieloma, leukemia/leucèmia,
// thrombosis/trombosi). Normalitzant aquestes grafies, la comparació funciona.
//
// ABAST DELIBERADAMENT ESTRET: només salta quan la NOSTRA peça anomena una
// malaltia o teràpia que NO surt a la font. No jutja el sentit, no entén la
// medicina i no substitueix ningú. Tapa el forat conegut, i prou.
function normalitzaClinic(text) {
  return normalitza(text)
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/ae|oe/g, 'e')
    .replace(/y/g, 'i')
    .replace(/k/g, 'c')
    .replace(/([a-z])\1/g, '$1')
}

// Arrels de malalties i estats prou freqüents perquè un canvi de nom passi per
// alt. S'escriuen en català i es normalitzen igual que la font.
const ARRELS_CLINIQUES = [
  'cancer', 'tumor', 'diabet', 'alzheimer', 'parkinson', 'asma', 'artritis',
  'ictus', 'infart', 'demencia', 'obesitat', 'colesterol', 'hipertensi',
  'tuberculosi', 'malaria', 'covid', 'hepatitis', 'osteoporosi', 'esclerosi',
  'epilepsi', 'migranya', 'anemia', 'autisme', 'sepsi',
]

// Paraules llargues amb terminació inequívocament clínica: mieloma, leucèmia,
// dermatitis, neuropatia, immunoteràpia, quimioteràpia…
const SUFIXOS_CLINICS = /\b[a-z]{4,}(oma|emia|itis|patia|terapia|sindrome|distrofia)\b/g

export function termesClinicsSenseSuport(story) {
  const font = materialDeFont(story)
  if (!font.trim()) return []
  const fontNorm = normalitzaClinic(font)
  const nostre = normalitzaClinic(
    `${story?.title || ''} ${Array.isArray(story?.body) ? story.body.join(' ') : ''}`,
  )
  const sospitosos = new Set()

  for (const arrel of ARRELS_CLINIQUES) {
    const a = normalitzaClinic(arrel)
    if (nostre.includes(a) && !fontNorm.includes(a)) sospitosos.add(arrel)
  }
  for (const terme of nostre.match(SUFIXOS_CLINICS) || []) {
    // Es compara l'arrel, no la paraula sencera: la desinència sí que canvia
    // entre llengües ("myeloma"/"mieloma" comparteixen "mielom").
    const arrel = terme.slice(0, 6)
    if (!fontNorm.includes(arrel)) sospitosos.add(terme)
  }
  return [...sospitosos]
}

function retallaPerAlPrompt(story) {
  const cos = Array.isArray(story?.body) ? story.body.join(' ') : ''
  // El material ORIGINAL hi ha d'anar. Sense ell, el model comparava la nostra
  // peça amb ella mateixa i la comprovació semàntica que se li demanava no es
  // podia fer de cap manera.
  return [
    `TITULAR NOSTRE: ${String(story?.title || '').slice(0, 160)}`,
    `ÀMBIT: ${story?.topic || '—'} · FONT: ${story?.source || '—'} · CIRCUIT: ${story?.circuit || '—'}`,
    `COS NOSTRE: ${cos.slice(0, 700)}`,
    '',
    `MATERIAL ORIGINAL DE LA FONT (això és el que s’ha de comparar):`,
    materialDeFont(story).slice(0, 1200) || '(no n’hi ha)',
  ].join('\n')
}

const SISTEMA = [
  "Ets l'ajudant de redacció d'El Bon Diari, un mitjà en català especialitzat",
  'en vuit àmbits: Ciència, Tecnologia, IA, Biotecnologia, Astronomia,',
  'Longevitat, Filosofia i Literatura.',
  'Has de decidir si una peça es publica, es descarta o si convé que la miri',
  'una persona. Respon EXACTAMENT una línia amb aquest format:',
  'VEREDICTE: publicar|descartar|dubte · MOTIU: <una frase curta en català>',
  '',
  'CRITERI, per ordre:',
  '1. TROBALLA, NO PROCÉS. Publica el que explica una cosa trobada, observada,',
  'demostrada o pensada. Descarta intencions, converses, plans, anuncis,',
  'projectes que comencen, moviments d’empreses, finançament i tendències de',
  'mercat. Si en llegir el titular el lector només sap què pensa fer algú, és',
  'descartar.',
  '2. Ha de pertànyer clarament a un dels vuit àmbits.',
  '3. Ha d’estar ben escrita en català, amb la font atribuïda i sense',
  'apropiar-se del treball de camp d’un altre mitjà.',
  '4. Si el text sembla prim, confús o repeteix una cosa que ja s’ha explicat,',
  'val més descartar.',
  '',
  'ABANS DE RES, COMPARA amb la font: si el titular o el cos afirmen alguna',
  'cosa que el material de la font no diu —un nom, una malaltia, una xifra, una',
  'conclusió més forta que l’original—, digues dubte i explica-ho al motiu.',
  'Aquesta comprovació va per davant de qualsevol altra consideració.',
  '',
  'SALUT I MEDICINA. Aquestes peces es publiquen automàticament i ningú no les',
  'llegirà abans que el lector. Extrema-hi la comprovació:',
  '· la malaltia, el fàrmac i la població de l’estudi han de ser EXACTAMENT els',
  'de la font; malalties de la mateixa família no són intercanviables;',
  '· si la font parla d’un assaig en animals o en laboratori i la peça ho fa',
  'semblar un tractament per a persones, digues dubte;',
  '· si la peça suggereix el que ha de fer un pacient, o dona una dosi, o promet',
  'una curació, digues dubte encara que la font ho digui.',
  'DUBTE és per a les peces que semblen bones però tenen alguna cosa que',
  'convé que miri una persona: una afirmació delicada, una xifra que no acabes',
  'de veure clara, un tema que toca gent concreta.',
  'Davant d’un dubte real, digues dubte. No et facis el valent.',
].join(' ')

function exemplesComText(exemples) {
  if (!exemples?.length) return ''
  const linies = exemples.slice(0, 24).map((e) => {
    const decisio = e.decision === 'approve' ? 'PUBLICAR' : 'DESCARTAR'
    return `- ${decisio}: ${String(e.title || '').slice(0, 110)}`
  })
  return [
    '',
    'DECISIONS REALS DE LA DIRECCIÓ DEL DIARI. Són el criteri de debò:',
    ...linies,
  ].join('\n')
}

function llegeixVeredicte(text) {
  const linia = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /veredicte/i.test(l))
  if (!linia) return { veredicte: DUBTE, motiu: 'no s’ha entès la resposta' }
  const v = /veredicte\s*:\s*(publicar|descartar|dubte)/i.exec(linia)
  const m = /motiu\s*:\s*(.+)$/i.exec(linia)
  return {
    veredicte: v ? v[1].toLowerCase() : DUBTE,
    motiu: (m ? m[1] : '').trim().slice(0, 200) || 'sense motiu',
  }
}

/**
 * El veredicte per a una peça. Les guàrdies manen sobre l'IA.
 */
export async function revisaCandidata(env, story, { exemples = [], abast = 'guarded' } = {}) {
  // SENSE FONT NO ES DECIDEIX. Que no hi hagi material amb què comparar no és
  // un permís: és precisament el cas en què no es pot comprovar res.
  if (!materialDeFont(story)) {
    return {
      veredicte: DUBTE,
      motiu: 'no hi ha material de la font amb què comparar la peça',
      guardia: 'sense-font',
    }
  }
  const sospitoses = dadesSenseSuport(story)
  if (sospitoses.length > 0) {
    return {
      veredicte: DUBTE,
      motiu: `el titular diu «${sospitoses.slice(0, 3).join(', ')}» i això no surt a la font`,
      guardia: 'fets',
    }
  }
  // Va DESPRÉS de la guàrdia de fets i ABANS de qualsevol criteri editorial:
  // canviar el nom d'una malaltia no és una qüestió de gust editorial.
  const clinics = termesClinicsSenseSuport(story)
  if (clinics.length > 0) {
    return {
      veredicte: DUBTE,
      motiu: `la peça parla de «${clinics.slice(0, 3).join(', ')}» i la font no en diu res`,
      guardia: 'clinica',
    }
  }
  const permes = potDecidirSol(story, { abast })
  if (!permes.pot) {
    return { veredicte: DUBTE, motiu: permes.motiu, guardia: 'sensible' }
  }
  try {
    const out = await runTextModel(env, {
      system: SISTEMA + exemplesComText(exemples),
      user: retallaPerAlPrompt(story),
      maxTokens: 200,
    })
    // El model que ha respost AQUESTA candidata viatja amb el veredicte. Vegeu
    // `runTextModel`: enmig d'un lot es pot canviar de proveïdor.
    return {
      ...llegeixVeredicte(out?.response),
      guardia: null,
      model: out?.provider ? `${out.provider}:${out.model}` : null,
    }
  } catch (error) {
    // Si l'ajudant no pot pensar, no decideix: ho deixa per a una persona.
    console.warn(
      JSON.stringify({
        event: 'assistant.review.failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return { veredicte: DUBTE, motiu: 'l’ajudant no ha pogut revisar-la', guardia: null }
  }
}
