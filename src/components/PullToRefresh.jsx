import { useEffect, useRef, useState } from 'react'
import { haptic, isNativePlatform } from '../lib/native.js'

// "Estira per actualitzar" natiu: gest de tibada des de dalt de tot que
// refresca el radar, amb resistència elàstica i feedback hàptic al llindar
// (com les apps natives d'iOS). Al web d'escriptori no s'activa; als
// dispositius tàctils sí. L'hàptic només sona dins de l'app.

const THRESHOLD = 72 // px de tibada (ja amortits) per disparar el refresc
const MAX_PULL = 120 // topall visual de la tibada
const RESISTANCE = 0.5 // com més tibes, més costa (sensació de goma)

export default function PullToRefresh({ onRefresh, children }) {
  const enabled =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || isNativePlatform())

  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [dragging, setDragging] = useState(false)

  // Refs perquè els listeners es registrin UN sol cop i sempre vegin l'estat viu.
  const startY = useRef(0)
  const active = useRef(false)
  const armed = useRef(false)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    if (!enabled) return undefined

    const atTop = () =>
      (window.scrollY || document.documentElement.scrollTop || 0) <= 0

    const setPullValue = (value) => {
      pullRef.current = value
      setPull(value)
    }

    const onStart = (event) => {
      if (refreshingRef.current || !atTop() || event.touches.length !== 1) return
      startY.current = event.touches[0].clientY
      active.current = true
      armed.current = false
    }

    const onMove = (event) => {
      if (!active.current || refreshingRef.current) return
      const dy = event.touches[0].clientY - startY.current

      // Tibant cap amunt o ja no som a dalt: cancel·la net.
      if (dy <= 0 || !atTop()) {
        active.current = false
        if (pullRef.current !== 0) setPullValue(0)
        setDragging(false)
        return
      }

      // Prenem el control del gest per evitar el rebot/recàrrega del navegador.
      event.preventDefault()
      setDragging(true)
      const dist = Math.min(MAX_PULL, dy * RESISTANCE)
      setPullValue(dist)

      // "Clic" hàptic just en creuar el llindar (només un cop per tibada).
      if (!armed.current && dist >= THRESHOLD) {
        armed.current = true
        haptic('light')
      } else if (armed.current && dist < THRESHOLD) {
        armed.current = false
      }
    }

    const onEnd = async () => {
      if (!active.current) return
      active.current = false
      setDragging(false)
      const shouldRefresh = pullRef.current >= THRESHOLD

      if (!shouldRefresh) {
        setPullValue(0)
        armed.current = false
        return
      }

      refreshingRef.current = true
      setRefreshing(true)
      setPullValue(THRESHOLD) // ancorat mentre carrega
      haptic('medium')
      try {
        await onRefreshRef.current?.()
      } catch {
        // silenci: el refresc ja registra els seus propis errors
      } finally {
        refreshingRef.current = false
        setRefreshing(false)
        setPullValue(0)
        armed.current = false
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled])

  if (!enabled) return children

  const progress = Math.min(1, pull / THRESHOLD)
  const ready = pull >= THRESHOLD

  return (
    <div className="ptr">
      <div
        className={`ptr__indicator ${refreshing ? 'is-refreshing' : ''} ${
          ready ? 'is-ready' : ''
        }`}
        style={{
          opacity: refreshing ? 1 : progress,
          transform: `translateY(${Math.min(pull, THRESHOLD) - THRESHOLD}px)`,
        }}
        aria-hidden={pull === 0 && !refreshing}
      >
        <span
          className="ptr__spinner"
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
          }}
        />
        <span className="ptr__label">
          {refreshing
            ? 'Actualitzant…'
            : ready
              ? 'Deixa anar per actualitzar'
              : 'Estira per actualitzar'}
        </span>
      </div>
      <div
        className={`ptr__content ${dragging ? 'is-dragging' : ''}`}
        style={{ transform: pull ? `translateY(${pull}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  )
}
