// Pont amb les capacitats natives de l'app (Capacitor). Al navegador tot fa
// fallback web, així que aquest mòdul és segur d'importar a tot arreu.

import { Capacitor } from '@capacitor/core'

export function isNativePlatform() {
  try {
    return !!(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform())
  } catch {
    return false
  }
}

// Compartir: full natiu d'iOS dins de l'app; Web Share API al mòbil web;
// WhatsApp com a últim recurs al desktop. Retorna true si s'ha compartit.
export async function shareContent({ title, text, url }) {
  if (isNativePlatform()) {
    try {
      const { Share } = await import('@capacitor/share')
      await Share.share({
        title,
        text,
        url,
        dialogTitle: 'Comparteix aquesta bona notícia',
      })
      return true
    } catch {
      // L'usuari ha cancel·lat el full de compartir: no fem res més.
      return false
    }
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return true
    } catch {
      // cancel·lat o no admès → fallback
    }
  }

  if (typeof window !== 'undefined') {
    const enc = encodeURIComponent
    window.open(
      `https://api.whatsapp.com/send?text=${enc(`${text}\n${url}`)}`,
      '_blank',
      'noopener',
    )
    return true
  }
  return false
}

// Feedback hàptic subtil. Només a l'app; al web és un no-op silenciós.
export async function haptic(style = 'light') {
  if (!isNativePlatform()) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    const map = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    }
    await Haptics.impact({ style: map[style] || ImpactStyle.Light })
  } catch {
    // silenci
  }
}
