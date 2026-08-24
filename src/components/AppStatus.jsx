import { useEffect, useRef, useState } from 'react'

function getInitialConnectionState() {
  if (typeof navigator === 'undefined') return 'online'
  return navigator.onLine ? 'online' : 'offline'
}

export default function AppStatus() {
  const [connection, setConnection] = useState(getInitialConnectionState)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const reconnectTimer = useRef(null)

  useEffect(() => {
    const showOffline = () => {
      window.clearTimeout(reconnectTimer.current)
      setConnection('offline')
    }
    const showReconnected = () => {
      setConnection('reconnected')
      window.clearTimeout(reconnectTimer.current)
      reconnectTimer.current = window.setTimeout(() => setConnection('online'), 4000)
    }

    window.addEventListener('offline', showOffline)
    window.addEventListener('online', showReconnected)
    return () => {
      window.removeEventListener('offline', showOffline)
      window.removeEventListener('online', showReconnected)
      window.clearTimeout(reconnectTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined

    let hadController = Boolean(navigator.serviceWorker.controller)
    const handleControllerChange = () => {
      if (hadController) setUpdateAvailable(true)
      hadController = true
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        if (registration?.waiting) setUpdateAvailable(true)
      })
      .catch(() => undefined)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  if (connection === 'online' && !updateAvailable) return null

  return (
    <aside
      className={`app-status app-status--${connection}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div>
        {connection === 'offline' ? (
          <>
            <strong>Sense connexió</strong>
            <span>Mostrem l’edició que tens desada.</span>
          </>
        ) : connection === 'reconnected' ? (
          <>
            <strong>Connexió recuperada</strong>
            <span>Ja pots actualitzar les notícies.</span>
          </>
        ) : null}
        {updateAvailable ? (
          <>
            <strong>Hi ha una edició nova disponible</strong>
            <button type="button" onClick={() => window.location.reload()}>
              Actualitza
            </button>
          </>
        ) : null}
      </div>
    </aside>
  )
}
