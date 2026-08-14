import { describe, expect, it, vi } from 'vitest'
import { applyOwnContent, parseOwnContentBatch } from '../storyText.js'

// LA LLENGUA HA D'ARRIBAR AL MISSATGE, NO NOMÉS AL PROMPT.
//
// `applyOwnContent` passava `language` (la de la FONT) i es deixava
// `outputLanguage` (la que s'ha d'ESCRIURE). Com que aiOwnContentBatch fa
// `outputLanguage || language`, el model rebia literalment
// "[escriu en anglès; CONSTRUCTIVA]" mentre el prompt de sistema li deia que
// escrivís en català. Dues ordres contràries: d'aquí venia que unes vegades
// sortís en català i altres en anglès.
//
// La prova que hi havia mirava el text estàtic del sistema i, per això, no
// podia veure aquesta pèrdua de dades. Aquesta mira el missatge REAL.

function envQueCaptura() {
  const enviats = []
  return {
    enviats,
    LIVE_NEWS_KV: {
      async get() {
        return null
      },
      async put() {},
    },
    AI: {
      run: vi.fn(async (model, opts) => {
        enviats.push(opts.messages.find((m) => m.role === 'user').content)
        return { response: '' }
      }),
    },
  }
}

function peca(overrides = {}) {
  return {
    url: 'https://example.org/una-noticia',
    title: 'Scientists find a new way to clean water with sunlight',
    summary: 'A team developed a low-cost solar device that purifies water.',
    sourceContext: 'A team developed a low-cost solar device that purifies water.',
    category: 'Ciència',
    editorialFormat: 'constructive',
    publishedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('la llengua de sortida arriba al model', () => {
  it('una font anglesa amb sortida en català demana ESCRIURE EN CATALÀ', async () => {
    const env = envQueCaptura()
    await applyOwnContent([peca({ language: 'en', outputLanguage: 'ca' })], env)
    const missatge = env.enviats.join('\n')
    expect(missatge).toContain('[escriu en català;')
    expect(missatge, 'mai ha de demanar que escrigui en la llengua de la font').not.toContain(
      '[escriu en anglès;',
    )
  })

  it('si no hi ha llengua de sortida, es fa servir la de la font', async () => {
    const env = envQueCaptura()
    await applyOwnContent([peca({ language: 'es' })], env)
    expect(env.enviats.join('\n')).toContain('[escriu en castellà;')
  })

  it('el context de la font hi va sencer: és el suport factual', async () => {
    const env = envQueCaptura()
    await applyOwnContent([peca({ language: 'en', outputLanguage: 'ca' })], env)
    expect(env.enviats.join('\n')).toContain('low-cost solar device')
  })
})

describe('el lector de respostes aguanta la marca de llengua', () => {
  it('llegeix el format normal', () => {
    const out = parseOwnContentBatch(
      '1 titular: Un titular qualsevol\n1 cos: Un cos qualsevol.\n1 impacte: Importa.',
      1,
    )
    expect(out[0].title).toBe('Un titular qualsevol')
    expect(out[0].body).toBe('Un cos qualsevol.')
  })

  it('llegeix també quan el model repeteix la marca abans del camp', () => {
    // Regressió reproduïda per Codex: amb "1. [escriu en català] titular: …"
    // es perdien TOTS els camps de la peça i quedava sense text.
    const out = parseOwnContentBatch(
      '1. [escriu en català] titular: Un titular qualsevol\n'
        + '1. [escriu en català] cos: Un cos qualsevol.\n'
        + '1. [escriu en català] impacte: Importa.',
      1,
    )
    expect(out[0].title).toBe('Un titular qualsevol')
    expect(out[0].body).toBe('Un cos qualsevol.')
    expect(out[0].impact).toBe('Importa.')
  })
})
