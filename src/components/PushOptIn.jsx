import { useEffect, useState } from 'react'

// Clau pública VAPID (és pública; la privada viu com a secret del Worker).
const VAPID_PUBLIC_KEY =
  'BCeqTqgGgg7f_acgcxXQC7_1IbJMYB9VPvV-i3VWgUVziV1Mrq9O4QJasPMBjyoT8_CleNWZoYOVHl2tGg9Mvvc'

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export default function PushOptIn() {
  // idle | unsupported | subscribed | denied | working | error
  const [state, setState] = useState('idle')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub) setState('subscribed')
      })
      .catch(() => undefined)
  }, [])

  async function subscribe() {
    setState('working')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'idle')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub),
      })
      setState('subscribed')
    } catch (error) {
      setState('error')
    }
  }

  if (state === 'unsupported') return null

  return (
    <div className="push-optin">
      {state === 'subscribed' ? (
        <p className="push-optin__ok">
          Fet. Rebràs la bona notícia del dia com a avís al teu dispositiu.
        </p>
      ) : state === 'denied' ? (
        <p className="push-optin__note">
          Tens els avisos bloquejats. Pots activar-los des dels permisos del navegador.
        </p>
      ) : (
        <>
          <button
            type="button"
            className="push-optin__btn"
            onClick={subscribe}
            disabled={state === 'working'}
          >
            {state === 'working' ? 'Activant…' : 'Rebre la bona notícia del dia al mòbil'}
          </button>
          {state === 'error' ? (
            <p className="push-optin__note">No s'ha pogut activar. Torna-ho a provar.</p>
          ) : null}
        </>
      )}
    </div>
  )
}
