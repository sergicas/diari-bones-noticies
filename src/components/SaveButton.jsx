import { useEffect, useState } from 'react'
import { isSaved, toggleSaved, SAVED_EVENT } from '../lib/saved.js'
import { haptic } from '../lib/native.js'

// Botó de desar/treure un article de la col·lecció local. Es manté sincronitzat
// amb altres botons de la mateixa peça via l'esdeveniment SAVED_EVENT.
export default function SaveButton({ story, className = '' }) {
  const [saved, setSaved] = useState(() => isSaved(story.id))

  useEffect(() => {
    function sync() {
      setSaved(isSaved(story.id))
    }
    window.addEventListener(SAVED_EVENT, sync)
    return () => window.removeEventListener(SAVED_EVENT, sync)
  }, [story.id])

  function onClick(event) {
    event.preventDefault()
    const nowSaved = toggleSaved(story)
    setSaved(nowSaved)
    haptic(nowSaved ? 'medium' : 'light')
  }

  return (
    <button
      type="button"
      className={`save-button ${saved ? 'is-saved' : ''} ${className}`.trim()}
      onClick={onClick}
      aria-pressed={saved}
    >
      {saved ? '✓ Desat per llegir després' : '＋ Desa per llegir després'}
    </button>
  )
}
