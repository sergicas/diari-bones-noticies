// Push NATIU d'iOS dins de l'app (Capacitor). Només s'activa quan el web corre
// dins de l'app nativa; al navegador no fa res (allà ja hi ha el Web Push).
// Demana permís, registra el device token a l'API (/api/push/register-apns) i,
// quan l'usuari toca una notificació, obre la peça corresponent.

import { Capacitor } from '@capacitor/core'

const NATIVE_PUSH_OPTION_KEY = 'bondiari-native-push-option-v1'
const NATIVE_PUSH_TOKEN_KEY = 'bondiari-native-push-token-v1'
let nativeRegistrationPromise = null

export function isNativePushAvailable() {
  return Boolean(
    typeof window !== 'undefined' &&
      Capacitor?.isNativePlatform?.(),
  )
}

export function isNativePushEnabled(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(NATIVE_PUSH_OPTION_KEY) === 'daily'
  } catch {
    return false
  }
}

async function registerNativePush({ requestPermission }) {
  if (!isNativePushAvailable()) return { enabled: false, unsupported: true }
  if (nativeRegistrationPromise) return nativeRegistrationPromise

  nativeRegistrationPromise = (async () => {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const current = await PushNotifications.checkPermissions()
    const permission =
      current.receive === 'granted' || !requestPermission
        ? current
        : await PushNotifications.requestPermissions()
    if (permission.receive !== 'granted') {
      return { enabled: false, denied: permission.receive === 'denied' }
    }

    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (callback, value) => {
        if (settled) return
        settled = true
        callback(value)
      }
      const timeout = window.setTimeout(
        () => finish(reject, new Error('apns-registration-timeout')),
        15000,
      )

      const setupRegistration = async () => {
        await PushNotifications.addListener('registration', async (token) => {
          try {
            const previousToken = localStorage.getItem(NATIVE_PUSH_TOKEN_KEY)
            const response = await fetch('/api/push/register-apns', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ token: token.value, option: 'daily' }),
            })
            if (!response.ok) throw new Error('apns-registration-rejected')
            localStorage.setItem(NATIVE_PUSH_TOKEN_KEY, token.value)
            localStorage.setItem(NATIVE_PUSH_OPTION_KEY, 'daily')
            if (previousToken && previousToken !== token.value) {
              void fetch('/api/push/unregister-apns', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ token: previousToken }),
              })
            }
            window.clearTimeout(timeout)
            finish(resolve, { enabled: true })
          } catch (error) {
            window.clearTimeout(timeout)
            finish(reject, error)
          }
        })
        await PushNotifications.addListener('registrationError', (error) => {
          window.clearTimeout(timeout)
          finish(reject, error)
        })
        await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const url = action?.notification?.data?.url
          if (url) window.location.href = url
        })
        await PushNotifications.register()
      }
      void setupRegistration().catch((error) => {
        window.clearTimeout(timeout)
        finish(reject, error)
      })
    })
  })()

  try {
    return await nativeRegistrationPromise
  } finally {
    nativeRegistrationPromise = null
  }
}

export function enableNativePush() {
  return registerNativePush({ requestPermission: true })
}

export async function disableNativePush() {
  if (!isNativePushAvailable()) return { disabled: true }
  const { PushNotifications } = await import('@capacitor/push-notifications')
  const token = localStorage.getItem(NATIVE_PUSH_TOKEN_KEY)
  if (token) {
    const response = await fetch('/api/push/unregister-apns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!response.ok) throw new Error('apns-unregister-rejected')
  }
  await PushNotifications.unregister()
  localStorage.removeItem(NATIVE_PUSH_TOKEN_KEY)
  localStorage.removeItem(NATIVE_PUSH_OPTION_KEY)
  return { disabled: true }
}

export async function initNativePush() {
  try {
    if (!isNativePushAvailable() || !isNativePushEnabled()) return
    await registerNativePush({ requestPermission: false })
  } catch (error) {
    console.warn('[push] no s\'ha pogut inicialitzar el push natiu', error)
  }
}
