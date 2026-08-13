// Porta única per a TOTA la IA de text del diari (jutjar notícies i reescriure
// titular+cos). Un sol lloc decideix quin proveïdor s'usa, i les crides de
// dalt (liveNews.js, storyText.js) no s'assabenten del canvi: reben sempre la
// mateixa forma de resposta, { response: '<text>' }.
//
// Regla del proveïdor, deliberadament SIMPLE i SEGURA:
//   · si hi ha una clau de Gemini configurada (env.GEMINI_API_KEY) → Gemini.
//   · si no → el model de Cloudflare de sempre (Llama), sense canvis.
//
// Efecte pràctic: mentre no es configuri la clau, el diari en producció
// funciona EXACTAMENT igual que ara. La clau és qui activa el canvi, i es pot
// desactivar tornant-la a treure. Cap risc per a l'edició en marxa.
//
// Les IL·LUSTRACIONS NO passen per aquí: segueixen a Cloudflare (FLUX, gratis
// dins la quota). Vegeu src/server/storyImage.js.

// Model de Cloudflare (el d'ara). Es manté com a xarxa de seguretat.
const CLOUDFLARE_TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

// Model de Gemini. "flash-lite" és el més barat de Google i suficient per a
// jutjar i reescriure. Es pot canviar amb la variable GEMINI_MODEL sense tocar
// el codi (p. ex. si Google reanomena el model o en surt un de millor).
const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest'

function geminiModel(env) {
  return (env?.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim()
}

// Crida a Gemini. La clau viatja per CAPÇALERA (x-goog-api-key), MAI per la
// URL: un secret a la URL acabaria als registres del servidor. La resposta de
// Gemini té una forma diferent de la de Cloudflare; aquí la normalitzem a
// { response: '<text>' } perquè les crides de dalt no hagin de canviar.
async function runGemini(env, { system, user, maxTokens }) {
  const model = geminiModel(env)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.4,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200)
    throw new Error(`gemini ${res.status}: ${detail}`)
  }

  const data = await res.json()
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part?.text || '')
    .join('')
  return { response: text }
}

// Crida al model de Cloudflare, tal com es feia fins ara.
async function runCloudflare(env, { system, user, maxTokens }) {
  return env.AI.run(CLOUDFLARE_TEXT_MODEL, {
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
}

// RECANVI QUAN GEMINI DIU PROU (14-08-2026).
//
// La nit del gir editorial el diari va deixar d'escriure sense que res ho
// digués: la quota gratuïta de Gemini es va esgotar, cada crida tornava un
// 429, les peces sortien amb ZERO paraules i la barrera de qualitat les
// rebutjava per buides. Semblava un problema de model o de barrera i no ho
// era. El diari es va quedar mut una nit sencera.
//
// El model de Cloudflare ja hi era, però només s'hi anava si NO hi havia clau
// de Gemini. Ara s'hi va també quan Gemini falla, sigui pel motiu que sigui:
// per a un diari, escriure amb el segon model sempre és millor que no
// escriure.
//
// La pausa evita trucar a Google set vegades per refresc sabent que dirà que
// no: quan una crida topa amb la quota, les següents van directes al recanvi
// durant un quart d'hora.
const FALLBACK_COOLDOWN_MS = 15 * 60 * 1000
let geminiPausatFinsA = 0

export function resetTextModelFallback() {
  geminiPausatFinsA = 0
}

// Punt d'entrada únic. Rep sistema + usuari + sostre de tokens i torna
// { response: '<text>' } passi el que passi amb el proveïdor triat.
export async function runTextModel(env, { system, user, maxTokens }) {
  const araMs = Date.now()
  if (!env?.GEMINI_API_KEY || araMs < geminiPausatFinsA) {
    return runCloudflare(env, { system, user, maxTokens })
  }
  try {
    return await runGemini(env, { system, user, maxTokens })
  } catch (error) {
    const motiu = error instanceof Error ? error.message : String(error)
    // Si no hi ha recanvi a mà, val més l'error de Gemini tal com és que un
    // "Cannot read properties of undefined" que no diu res a qui el llegeixi.
    if (typeof env?.AI?.run !== 'function') throw error
    // La quota esgotada i el límit de peticions per minut són els dos casos
    // en què insistir no serveix de res durant una bona estona.
    if (/\b429\b/.test(motiu)) {
      geminiPausatFinsA = araMs + FALLBACK_COOLDOWN_MS
    }
    console.warn(
      JSON.stringify({
        event: 'ai.text.fallback',
        motiu: motiu.slice(0, 160),
        pausatFinsA: geminiPausatFinsA
          ? new Date(geminiPausatFinsA).toISOString()
          : null,
      }),
    )
    return runCloudflare(env, { system, user, maxTokens })
  }
}

// Quin proveïdor s'està fent servir de debò (per als registres i el diagnòstic).
export function activeTextProvider(env) {
  if (!env?.GEMINI_API_KEY) return 'cloudflare'
  if (Date.now() < geminiPausatFinsA) return 'cloudflare (recanvi: Gemini sense quota)'
  return `gemini:${geminiModel(env)}`
}
