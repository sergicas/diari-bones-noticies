import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initNativePush } from './lib/nativePush.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Push natiu d'iOS (només quan corre dins de l'app Capacitor).
void initNativePush()

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  let isReloadingForUpdate = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isReloadingForUpdate) return
    isReloadingForUpdate = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => console.warn('[bondiari] No s’ha pogut registrar el service worker', error))
  })
} else if ('serviceWorker' in navigator) {
  // Un SW d'un preview anterior pot servir mòduls Vite antics i amagar canvis
  // locals. En desenvolupament el retirem; només producció necessita la PWA.
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      Promise.all(registrations.map((registration) => registration.unregister())),
    )
    .catch(() => undefined)
}
