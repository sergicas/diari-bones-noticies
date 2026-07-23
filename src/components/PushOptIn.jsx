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

function getInitialPushState() {
  if (typeof window === 'undefined') return 'unsupported'
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported'
  }
  return Notification.permission === 'denied' ? 'denied' : 'idle'
}

export default function PushOptIn() {
  // idle | unsupported | subscribed | denied | working | error
  const [state, setState] = useState(getInitialPushState)

  useEffect(() => {
    if (getInitialPushState() !== 'idle') return undefined
    let cancelled = false
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled && sub) setState('subscribed')
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
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
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub),
      })
      if (!response.ok) throw new Error('push-subscription-rejected')
      setState('subscribed')
    } catch {
      setState('error')
    }
  }

  if (state === 'unsupported') return null

  return (
    <div className="push-optin">
      {state === 'subscribed' ? (
        <p className="push-optin__ok">
          Fet. Rebràs la peça destacada del dia com a avís al teu dispositiu.
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
            {state === 'working' ? 'Activant…' : 'Rebre la peça destacada del dia al mòbil'}
          </button>
          {state === 'error' ? (
            <p className="push-optin__note">No s'ha pogut activar. Torna-ho a provar.</p>
          ) : null}
        </>
      )}
    </div>
  )
}
