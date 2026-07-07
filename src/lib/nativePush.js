// Push NATIU d'iOS dins de l'app (Capacitor). Només s'activa quan el web corre
// dins de l'app nativa; al navegador no fa res (allà ja hi ha el Web Push).
// Demana permís, registra el device token a l'API (/api/push/register-apns) i,
// quan l'usuari toca una notificació, obre la peça corresponent.

import { Capacitor } from '@capacitor/core'

export async function initNativePush() {
  try {
    if (typeof window === 'undefined') return
    if (!Capacitor || !Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) return

    const { PushNotifications } = await import('@capacitor/push-notifications')

    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return
    await PushNotifications.register()

    PushNotifications.addListener('registration', async (token) => {
      try {
        await fetch('/api/push/register-apns', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: token.value }),
        })
      } catch (error) {
        // silenci: reintentarà en el proper arrencament
      }
    })

    PushNotifications.addListener('registrationError', (error) => {
      console.warn('[push] error de registre APNs', error)
    })

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action && action.notification && action.notification.data && action.notification.data.url
      if (url) window.location.href = url
    })
  } catch (error) {
    console.warn('[push] no s\'ha pogut inicialitzar el push natiu', error)
  }
}
