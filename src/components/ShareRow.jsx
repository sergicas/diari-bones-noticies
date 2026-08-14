import { useState } from 'react'
import { shareContent, haptic, isNativePlatform } from '../lib/native.js'

const siteUrl = 'https://bondiari.com'

// INSTAGRAM, NOMÉS ON POT FER ALGUNA COSA (14-08-2026).
//
// Instagram és l'ÚNICA xarxa de la fila que no permet compartir un enllaç des
// del web: no té cap adreça per fer-ho. Les altres set són enllaços de debò i
// obren la pàgina de la xarxa amb la notícia posada.
//
// Al mòbil el botó sí que serveix, perquè obre el menú de compartir del
// sistema i des d'allà es pot triar Instagram. A l'ordinador no hi ha aquest
// menú: el botó només copiava l'enllaç i canviava el text un moment, cosa que
// passava desapercebuda. El lector clicava, no s'obria res, i semblava
// espatllat — i pitjor encara, semblava espatllat NOSTRE.
//
// La condició mira si l'aparell té menú de compartir, que és exactament la
// capacitat que fa útil el botó, en lloc d'endevinar si és un mòbil per la
// mida de la pantalla o pel nom del navegador.
function potCompartirDeVeritat() {
  if (typeof navigator === 'undefined') return false
  return isNativePlatform() || typeof navigator.share === 'function'
}

export default function ShareRow({ story }) {
  const [copied, setCopied] = useState(false)
  const [instaCopied, setInstaCopied] = useState(false)
  // Es calcula una sola vegada, en néixer el component. El diari es dibuixa
  // sempre al navegador (l'HTML prerenderitzat porta el #root buit a propòsit,
  // vegeu server/storyMeta.js), així que aquí ja hi ha `navigator`.
  const [mostraInstagram] = useState(potCompartirDeVeritat)
  const storyPath = `/noticia/${encodeURIComponent(story.id)}`
  const url = `${siteUrl}${storyPath}`
  const text = `${story.title} — El Bon Diari`
  const enc = encodeURIComponent

  const targets = [
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      href: `https://api.whatsapp.com/send?text=${enc(`${text}\n${url}`)}`,
    },
    {
      key: 'telegram',
      label: 'Telegram',
      href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
    },
    {
      key: 'x',
      label: 'X',
      href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`,
    },
    {
      key: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    },
    {
      key: 'linkedin',
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
    },
    {
      key: 'bluesky',
      label: 'Bluesky',
      href: `https://bsky.app/intent/compose?text=${enc(`${text} ${url}`)}`,
    },
    {
      key: 'mastodon',
      label: 'Mastodont.cat',
      href: `https://mastodont.cat/share?text=${enc(`${text} ${url}`)}`,
    },
  ]

  function copyLink(event) {
    event.preventDefault()
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  // INSTAGRAM VOL UNA IMATGE, NO UN ENLLAÇ (14-08-2026).
  //
  // Compartint l'ENLLAÇ, Instagram només en sap fer un missatge privat: obre
  // la llista de seguidors i demana a qui l'envies. No hi ha manera de
  // publicar-lo, perquè Instagram no accepta enllaços com a contingut.
  //
  // Compartint una IMATGE, en canvi, ofereix Stories i publicació. Per això
  // enviem la il·lustració de la peça i deixem l'adreça al porta-retalls: a
  // Stories s'hi pot enganxar després amb un adhesiu d'enllaç.
  async function comparteixImatge() {
    if (!story.imageUrl) return false
    if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) {
      return false
    }
    try {
      const resposta = await fetch(story.imageUrl)
      if (!resposta.ok) return false
      const blob = await resposta.blob()
      if (!blob.type.startsWith('image/')) return false
      const extensio = blob.type.split('/')[1]?.split('+')[0] || 'png'
      const fitxer = new File([blob], `bondiari.${extensio}`, { type: blob.type })
      if (!navigator.canShare({ files: [fitxer] })) return false
      // L'adreça, al porta-retalls abans d'obrir el menú: després de compartir,
      // la pàgina pot haver perdut el permís d'escriure-hi.
      try {
        await navigator.clipboard?.writeText(url)
      } catch {
        // No és imprescindible; la imatge ja és el que importa.
      }
      await navigator.share({ files: [fitxer], text })
      return true
    } catch {
      // Imatge d'un altre domini, menú cancel·lat o navegador que no admet
      // compartir fitxers → provem la via de sempre.
      return false
    }
  }

  async function shareInstagram(event) {
    event.preventDefault()
    haptic('light')
    if (await comparteixImatge()) {
      setInstaCopied(true)
      setTimeout(() => setInstaCopied(false), 3500)
      return
    }
    if (isNativePlatform()) {
      await shareContent({ title: text, text, url })
      return
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: text, text, url })
        return
      } catch {
        // cancel·lat o no admès → fallback a copiar l'enllaç
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url)
        setInstaCopied(true)
        setTimeout(() => setInstaCopied(false), 3500)
      } catch {
        // ignored
      }
    }
  }

  async function primaryShare(event) {
    event.preventDefault()
    // Feedback hàptic a l'app; full de compartir natiu d'iOS (o Web Share al web).
    haptic('light')
    await shareContent({ title: text, text, url })
  }

  return (
    <div className="share-block">
      <p className="share-block__cta">
        Coneixes algú a qui li pugui servir? Envia-l'hi.
      </p>
      <button type="button" className="share-block__primary" onClick={primaryShare}>
        Comparteix aquesta peça
      </button>
      <div className="share-row" aria-label="Compartir aquesta notícia">
        <span className="share-row__label">Comparteix:</span>
      {targets.map((target) => (
        <a
          key={target.key}
          className={`share-row__chip share-row__chip--${target.key}`}
          href={target.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {target.label}
        </a>
      ))}
      {mostraInstagram && (
        <button
          type="button"
          className="share-row__chip share-row__chip--instagram"
          onClick={shareInstagram}
          aria-label="Compartir a Instagram amb el menú de l'aparell"
        >
          {instaCopied ? 'Enllaç copiat per a Instagram ✓' : 'Instagram'}
        </button>
      )}
      <button
        type="button"
        className="share-row__chip share-row__chip--copy"
        onClick={copyLink}
      >
        {copied ? 'Enllaç copiat ✓' : 'Copia enllaç'}
      </button>
      </div>
    </div>
  )
}
