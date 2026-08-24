import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  runTextModel,
  activeTextProvider,
  resetTextModelFallback,
} from '../ai/textModel.js'

afterEach(() => {
  vi.restoreAllMocks()
  // La pausa del recanvi viu al mòdul (a propòsit: en producció ha de durar
  // entre peticions). Entre proves s'ha de netejar, o una prova que esgota la
  // quota deixa la següent parlant amb el model equivocat.
  resetTextModelFallback()
})

describe('porta única de la IA de text', () => {
  // Sense clau de Gemini, el diari ha de seguir EXACTAMENT com ara: model de
  // Cloudflare, mateixa forma de resposta. És el que garanteix que producció no
  // canvia fins que no es configura la clau.
  it('sense clau, fa servir Cloudflare tal com abans', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'veredicte llama' })
    const env = { AI: { run } }

    const out = await runTextModel(env, {
      system: 'ets el jutge',
      user: 'titulars...',
      maxTokens: 256,
    })

    expect(out.response).toBe('veredicte llama')
    expect(run).toHaveBeenCalledOnce()
    // La forma de crida a Cloudflare no ha canviat: model + max_tokens + messages.
    const [model, options] = run.mock.calls[0]
    expect(model).toContain('llama')
    expect(options.max_tokens).toBe(256)
    expect(options.messages[0]).toEqual({ role: 'system', content: 'ets el jutge' })
    expect(activeTextProvider(env)).toBe('cloudflare')
  })

  // Amb clau, va a Gemini. Es comprova el que importa de debò per seguretat i
  // per no petar: la clau viatja per CAPÇALERA (mai a la URL), i la resposta
  // —que Gemini torna amb una altra forma— es normalitza a { response }.
  it('amb clau, crida Gemini i normalitza la resposta', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: '1 titular: Hola' }, { text: '\n1 cos: món' }] } },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const env = { GEMINI_API_KEY: 'clau-de-prova', AI: { run: vi.fn() } }
    const out = await runTextModel(env, {
      system: 'reescriu',
      user: 'notícies...',
      maxTokens: 4800,
    })

    // Les parts de Gemini s'ajunten en un sol text.
    expect(out.response).toBe('1 titular: Hola\n1 cos: món')

    const [url, init] = fetchMock.mock.calls[0]
    // La clau NO és a la URL (evita que quedi als registres).
    expect(url).not.toContain('clau-de-prova')
    // Sí que és a la capçalera dedicada de Google.
    expect(init.headers['x-goog-api-key']).toBe('clau-de-prova')
    const body = JSON.parse(init.body)
    expect(body.systemInstruction.parts[0].text).toBe('reescriu')
    expect(body.contents[0].parts[0].text).toBe('notícies...')
    expect(body.generationConfig.maxOutputTokens).toBe(4800)
    // El model de Cloudflare NO s'ha tocat.
    expect(env.AI.run).not.toHaveBeenCalled()
    expect(activeTextProvider(env)).toMatch(/^gemini:/)
  })

  // Quan NO hi ha model de recanvi a mà, l'error de Gemini ha d'arribar tal
  // com és. Si es dilueix, qui llegeixi el registre no sabrà mai que el que
  // passava era que s'havia esgotat la quota.
  it('propaga un error clar si Gemini respon malament i no hi ha recanvi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'quota exhausted',
      }),
    )
    const env = { GEMINI_API_KEY: 'x' }
    await expect(
      runTextModel(env, { system: 's', user: 'u', maxTokens: 10 }),
    ).rejects.toThrow(/gemini 429/)
  })

  it('el model de Gemini es pot canviar per variable d’entorn', () => {
    expect(activeTextProvider({ GEMINI_API_KEY: 'x', GEMINI_MODEL: 'gemini-2.5-pro' })).toBe(
      'gemini:gemini-2.5-pro',
    )
  })
})
