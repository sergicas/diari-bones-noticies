// LA TARGETA PER A INSTAGRAM
//
// Instagram no accepta enllaços com a contingut publicable: compartint-hi una
// adreça només en sap fer un missatge privat, i per això demana a quins
// seguidors l'envies. Amb una IMATGE, en canvi, ofereix Stories i publicació.
//
// Però perquè la publicació s'entengui sola, la imatge ha de dur el titular a
// sobre. Aquesta funció dibuixa la mateixa targeta que el robot del matí fa
// amb Python (bondiari_xarxes.py, munta_targeta): fons de paper, mosaic de
// colors, capçalera, titular gran i el colibrí a baix a la dreta.
//
// Es dibuixa AL MATEIX APARELL, amb un canvas, en el moment de compartir. Fer-ho
// al servidor obligaria a portar-hi un rasteritzador de SVG (mig mega de wasm)
// dins d'un Worker que va just de mida; aquí no costa res i funciona sense
// connexió amb el servidor d'imatges.

const MIDA = 1080
const MARGE = 96

const PAPER = '#fffaf1'
const TINTA = '#141414'
const GRIS = '#78746c'
const VERMELL = '#e72a30'
const MOSAIC = [VERMELL, '#ffe000', '#1e50a0', '#000000']

const MESOS = [
  'gener', 'febrer', 'març', 'abril', 'maig', 'juny',
  'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre',
]

function dataLlarga(date = new Date()) {
  const mes = MESOS[date.getMonth()]
  // "d'abril", "d'agost", "d'octubre": apostrofació davant de vocal. El robot
  // de Python escrivia "de agost" des del primer dia.
  const preposicio = /^[aeiou]/i.test(mes) ? "d'" : 'de '
  return `${date.getDate()} ${preposicio}${mes} del ${date.getFullYear()}`
}

// Georgia hi és a iOS i a macOS, que és des d'on es comparteix. A la resta,
// qualsevol serif fa la mateixa feina: el que importa és que no sigui de pal sec.
const SERIF = 'Georgia, "Times New Roman", serif'
const PAL_SEC = '-apple-system, "Helvetica Neue", Arial, sans-serif'

function carregaImatge(src) {
  return new Promise((resolve) => {
    const img = new Image()
    // Mateix domini, però ho declarem igualment: sense això el canvas quedaria
    // "tacat" i no en podríem treure la imatge.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Parteix el titular en línies que càpiguen, provant mides de lletra. */
function reparteixTitular(ctx, titular, ampladaMaxima) {
  for (const mida of [84, 76, 68, 60, 54, 48]) {
    ctx.font = `bold ${mida}px ${SERIF}`
    const linies = []
    let linia = ''
    for (const paraula of String(titular || '').split(/\s+/)) {
      const prova = linia ? `${linia} ${paraula}` : paraula
      if (ctx.measureText(prova).width <= ampladaMaxima || !linia) {
        linia = prova
      } else {
        linies.push(linia)
        linia = paraula
      }
    }
    if (linia) linies.push(linia)
    if (linies.length <= 5) return { mida, linies }
  }
  return { mida: 48, linies: [] }
}

/**
 * Dibuixa la targeta i la torna com a fitxer PNG, a punt per compartir.
 * Torna null si el navegador no en sap (llavors qui la demana ja fa una altra
 * cosa, en lloc de quedar-se sense compartir).
 */
export async function creaTargetaInstagram(titular, { data = new Date() } = {}) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = MIDA
  canvas.height = MIDA
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, MIDA, MIDA)

  // Mosaic de la capçalera.
  let x = MARGE
  for (const color of MOSAIC) {
    ctx.fillStyle = color
    ctx.fillRect(x, MARGE, 30, 30)
    x += 36
  }

  ctx.textBaseline = 'top'
  ctx.fillStyle = TINTA
  ctx.font = `34px ${PAL_SEC}`
  ctx.fillText('EL BON DIARI', MARGE, MARGE + 46)

  ctx.fillStyle = GRIS
  ctx.font = `26px ${PAL_SEC}`
  ctx.fillText(dataLlarga(data), MARGE, MARGE + 90)

  ctx.strokeStyle = TINTA
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(MARGE, MARGE + 132)
  ctx.lineTo(MIDA - MARGE, MARGE + 132)
  ctx.stroke()

  ctx.fillStyle = VERMELL
  ctx.font = `26px ${PAL_SEC}`
  ctx.fillText('LA BONA NOTÍCIA DEL DIA', MARGE, 300)

  const { mida, linies } = reparteixTitular(ctx, titular, MIDA - 2 * MARGE)
  ctx.fillStyle = TINTA
  ctx.font = `bold ${mida}px ${SERIF}`
  let y = 350
  for (const linia of linies) {
    ctx.fillText(linia, MARGE, y)
    y += Math.round(mida * 1.18)
  }

  ctx.fillStyle = TINTA
  ctx.font = `32px ${PAL_SEC}`
  ctx.fillText('bondiari.com', MARGE, MIDA - MARGE - 30)

  const logo = await carregaImatge('/logo-colibri.png')
  if (logo && logo.width) {
    const escala = Math.min(150 / logo.width, 150 / logo.height)
    const w = Math.round(logo.width * escala)
    const h = Math.round(logo.height * escala)
    ctx.drawImage(logo, MIDA - MARGE - w, MIDA - MARGE - h, w, h)
  }

  const blob = await new Promise((resolve) => {
    if (!canvas.toBlob) return resolve(null)
    canvas.toBlob(resolve, 'image/png')
  })
  if (!blob) return null
  return new File([blob], 'bondiari.png', { type: 'image/png' })
}
