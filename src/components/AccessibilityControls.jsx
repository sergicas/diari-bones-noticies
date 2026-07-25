import { useState, useEffect } from 'react'

export function AccessibilityControls() {
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window === 'undefined') return 'normal'
    return window.localStorage.getItem('bondiari-font-size') || 'normal'
  })

  const [highLegibility, setHighLegibility] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('bondiari-high-legibility') === 'true'
  })

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.classList.remove('font-size-large', 'font-size-xlarge')
    if (fontSize === 'large') root.classList.add('font-size-large')
    if (fontSize === 'xlarge') root.classList.add('font-size-xlarge')
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('bondiari-font-size', fontSize)
    }
  }, [fontSize])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (highLegibility) {
      root.classList.add('high-legibility')
    } else {
      root.classList.remove('high-legibility')
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('bondiari-high-legibility', String(highLegibility))
    }
  }, [highLegibility])

  return (
    <div
      className="accessibility-controls no-print"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.4rem 0.8rem',
        borderRadius: '999px',
        border: '1px solid var(--line-strong, rgba(0,0,0,0.15))',
        background: 'var(--paper, #ffffff)',
        color: 'var(--ink, #000000)',
        fontSize: '0.85rem',
      }}
      aria-label="Controls d'accessibilitat de lectura"
    >
      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--muted, #888)' }}>
        Mida:
      </span>
      <button
        type="button"
        onClick={() => setFontSize('normal')}
        aria-label="Mida de font normal"
        style={{
          fontWeight: fontSize === 'normal' ? 'bold' : 'normal',
          textDecoration: fontSize === 'normal' ? 'underline' : 'none',
          padding: '2px 6px',
        }}
      >
        A
      </button>
      <button
        type="button"
        onClick={() => setFontSize('large')}
        aria-label="Mida de font gran"
        style={{
          fontSize: '1rem',
          fontWeight: fontSize === 'large' ? 'bold' : 'normal',
          textDecoration: fontSize === 'large' ? 'underline' : 'none',
          padding: '2px 6px',
        }}
      >
        A+
      </button>
      <button
        type="button"
        onClick={() => setFontSize('xlarge')}
        aria-label="Mida de font molt gran"
        style={{
          fontSize: '1.15rem',
          fontWeight: fontSize === 'xlarge' ? 'bold' : 'normal',
          textDecoration: fontSize === 'xlarge' ? 'underline' : 'none',
          padding: '2px 6px',
        }}
      >
        A++
      </button>

      <span style={{ color: 'var(--line-strong, #ccc)', margin: '0 4px' }}>|</span>

      <button
        type="button"
        onClick={() => setHighLegibility(!highLegibility)}
        aria-label={highLegibility ? 'Desactivar alta llegibilitat' : 'Activar alta llegibilitat'}
        style={{
          fontWeight: highLegibility ? 'bold' : 'normal',
          background: highLegibility ? 'var(--color-success)' : 'transparent',
          color: highLegibility ? '#ffffff' : 'inherit',
          borderRadius: '12px',
          padding: '2px 8px',
        }}
      >
        Alta llegibilitat
      </button>
    </div>
  )
}

export default AccessibilityControls
