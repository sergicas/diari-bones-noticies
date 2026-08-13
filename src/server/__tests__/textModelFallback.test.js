import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  activeTextProvider,
  resetTextModelFallback,
  runTextModel,
} from '../ai/textModel.js'

// La nit del gir editorial el diari va deixar d'escriure sense dir-ho: la
// quota de Gemini es va esgotar, cada crida tornava 429, les peces sortien amb
// zero paraules i la barrera les rebutjava per buides. Semblava un problema de
// model. Aquestes proves vigilen que no torni a passar en silenci.

function envAmbGemini(fetchImpl) {
  globalThis.fetch = fetchImpl
  return {
    GEMINI_API_KEY: 'clau-de-prova',
    AI: {
      run: vi.fn(async () => ({ response: 'text del recanvi' })),
    },
  }
}

function respostaGemini(text) {
  return async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
}

function quotaEsgotada() {
  return async () =>
    new Response(JSON.stringify({ error: { code: 429, message: 'quota' } }), {
      status: 429,
    })
}

const fetchOriginal = globalThis.fetch
const encarrec = { system: 'sistema', user: 'usuari', maxTokens: 100 }

beforeEach(() => resetTextModelFallback())
afterEach(() => {
  globalThis.fetch = fetchOriginal
  vi.useRealTimers()
})

describe('recanvi quan Gemini no pot escriure', () => {
  it('sense clau de Gemini, escriu amb el model de Cloudflare', async () => {
    const env = { AI: { run: vi.fn(async () => ({ response: 'cloudflare' })) } }
    const out = await runTextModel(env, encarrec)
    expect(out.response).toBe('cloudflare')
    expect(activeTextProvider(env)).toBe('cloudflare')
  })

  it('amb clau i quota, escriu amb Gemini', async () => {
    const env = envAmbGemini(respostaGemini('text de gemini'))
    const out = await runTextModel(env, encarrec)
    expect(out.response).toBe('text de gemini')
    expect(env.AI.run).not.toHaveBeenCalled()
  })

  it('si la quota s’esgota, NO es queda mut: escriu amb el recanvi', async () => {
    const env = envAmbGemini(quotaEsgotada())
    const out = await runTextModel(env, encarrec)
    expect(out.response).toBe('text del recanvi')
    expect(env.AI.run).toHaveBeenCalledTimes(1)
  })

  it('després d’una quota esgotada no insisteix: va directe al recanvi', async () => {
    const fetchSpy = vi.fn(quotaEsgotada())
    const env = envAmbGemini(fetchSpy)
    await runTextModel(env, encarrec)
    await runTextModel(env, encarrec)
    await runTextModel(env, encarrec)
    // Una sola trucada a Google; les altres dues, directes al recanvi.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(env.AI.run).toHaveBeenCalledTimes(3)
  })

  it('el diagnòstic diu clarament que s’està fent servir el recanvi', async () => {
    const env = envAmbGemini(quotaEsgotada())
    expect(activeTextProvider(env)).toContain('gemini')
    await runTextModel(env, encarrec)
    expect(activeTextProvider(env)).toContain('recanvi')
  })

  it('passada la pausa, torna a provar Gemini', async () => {
    vi.useFakeTimers()
    const env = envAmbGemini(quotaEsgotada())
    await runTextModel(env, encarrec)
    vi.advanceTimersByTime(16 * 60 * 1000)
    globalThis.fetch = respostaGemini('gemini ha tornat')
    const out = await runTextModel(env, encarrec)
    expect(out.response).toBe('gemini ha tornat')
  })

  it('també fa el recanvi si Gemini falla per qualsevol altre motiu', async () => {
    const env = envAmbGemini(async () => {
      throw new Error('xarxa caiguda')
    })
    const out = await runTextModel(env, encarrec)
    expect(out.response).toBe('text del recanvi')
  })
})
