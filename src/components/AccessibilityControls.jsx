import { useEffect, useState } from 'react'
import '../styles/accessibility.css'

const fontSizeStorageKey = 'bondiari-font-size'
const highLegibilityStorageKey = 'bondiari-high-legibility'
const fontOptions = [
  { value: 'normal', label: 'Normal', shortLabel: 'A' },
  { value: 'large', label: 'Gran', shortLabel: 'A+' },
  { value: 'xlarge', label: 'Molt gran', shortLabel: 'A++' },
]

function readStoredValue(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    return window.localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function writeStoredValue(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Les preferències continuen funcionant durant la sessió encara que el
    // navegador bloquegi localStorage.
  }
}

export function AccessibilityControls() {
  const [fontSize, setFontSize] = useState(() =>
    readStoredValue(fontSizeStorageKey, 'normal'),
  )
  const [highLegibility, setHighLegibility] = useState(
    () => readStoredValue(highLegibilityStorageKey, 'false') === 'true',
  )
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.classList.remove('font-size-large', 'font-size-xlarge')
    if (fontSize === 'large') root.classList.add('font-size-large')
    if (fontSize === 'xlarge') root.classList.add('font-size-xlarge')
    writeStoredValue(fontSizeStorageKey, fontSize)
  }, [fontSize])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.classList.toggle('high-legibility', highLegibility)
    writeStoredValue(highLegibilityStorageKey, String(highLegibility))
  }, [highLegibility])

  const chooseFontSize = (option) => {
    setFontSize(option.value)
    setAnnouncement(`Mida de lletra: ${option.label}.`)
  }

  const toggleLegibility = () => {
    setHighLegibility((current) => {
      const next = !current
      setAnnouncement(
        next
          ? 'Alta llegibilitat activada.'
          : 'Alta llegibilitat desactivada.',
      )
      return next
    })
  }

  const resetPreferences = () => {
    setFontSize('normal')
    setHighLegibility(false)
    setAnnouncement('Preferències de lectura restablertes.')
  }

  return (
    <section
      id="accessibilitat"
      className="accessibility-controls no-print"
      aria-labelledby="accessibility-controls-title"
    >
      <div className="accessibility-controls__intro">
        <p id="accessibility-controls-title">Preferències de lectura</p>
        <span>Es guarden només en aquest dispositiu.</span>
      </div>

      <div
        className="accessibility-controls__sizes"
        role="group"
        aria-label="Mida de lletra"
      >
        {fontOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`accessibility-choice ${
              fontSize === option.value ? 'is-active' : ''
            }`}
            onClick={() => chooseFontSize(option)}
            aria-label={`Mida de lletra ${option.label.toLowerCase()}`}
            aria-pressed={fontSize === option.value}
          >
            {option.shortLabel}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`accessibility-toggle ${highLegibility ? 'is-active' : ''}`}
        onClick={toggleLegibility}
        aria-pressed={highLegibility}
      >
        Alta llegibilitat
      </button>

      <button
        type="button"
        className="accessibility-reset"
        onClick={resetPreferences}
        disabled={fontSize === 'normal' && !highLegibility}
      >
        Restablir
      </button>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  )
}

export default AccessibilityControls
