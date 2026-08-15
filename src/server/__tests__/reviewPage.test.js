import { describe, expect, it } from 'vitest'
import { handleReviewRoutes } from '../reviewPage.js'

const PASSWORD = 'una-contrasenya-de-prova'

async function cookieValue(password = PASSWORD) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`bondiari-revisio:${password}`),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function pendingRow(overrides = {}) {
  return {
    id: 'peca-secreta',
    first_seen_at: '2026-08-13T06:00:00.000Z',
    payload_json: JSON.stringify({
      id: 'peca-secreta',
      url: 'https://example.com/peca-secreta',
      title: 'Titular que encara no ha de ser públic',
      summary: 'Resum pendent de revisió.',
      source: 'Font de prova',
      circuit: 'B',
      topic: 'Filosofia',
      body: ['Un paràgraf pendent.'],
      ...overrides,
    }),
  }
}

function fakeEnv({ rows = [pendingRow()], password = PASSWORD } = {}) {
  return {
    BONDIARI_REVIEW_PASSWORD: password,
    EDITORIAL_DB: {
      prepare: () => ({
        bind() {
          return this
        },
        async all() {
          return { results: rows }
        },
        async first() {
          return null
        },
        async run() {
          return { success: true, meta: { changes: 0 } }
        },
      }),
      async batch(statements) {
        return statements.map(() => ({ meta: { changes: 0 } }))
      },
    },
  }
}

function get(path, headers = {}) {
  return new Request(`https://bondiari.com${path}`, { headers })
}

describe('sala de revisió', () => {
  it('no es fica en cap altra ruta del diari', async () => {
    expect(await handleReviewRoutes(get('/'), fakeEnv())).toBeNull()
    expect(await handleReviewRoutes(get('/noticia/x'), fakeEnv())).toBeNull()
  })

  it('no existeix si no s’hi ha posat contrasenya', async () => {
    const response = await handleReviewRoutes(get('/revisio'), fakeEnv({ password: '' }))
    expect(response.status).toBe(404)
  })

  it('sense entrar, demana la contrasenya i NO ensenya cap peça', async () => {
    const response = await handleReviewRoutes(get('/revisio'), fakeEnv())
    const body = await response.text()
    expect(body).toContain('Contrasenya')
    expect(body).not.toContain('Titular que encara no ha de ser públic')
  })

  it('rebutja una contrasenya equivocada', async () => {
    const request = new Request('https://bondiari.com/revisio', {
      method: 'POST',
      body: new URLSearchParams({ contrasenya: 'equivocada' }),
    })
    const response = await handleReviewRoutes(request, fakeEnv())
    expect(response.status).toBe(401)
    expect(await response.text()).toContain('incorrecta')
  })

  it('amb la contrasenya bona deixa una galeta segura i de llarga durada', async () => {
    const request = new Request('https://bondiari.com/revisio', {
      method: 'POST',
      body: new URLSearchParams({ contrasenya: PASSWORD }),
    })
    const response = await handleReviewRoutes(request, fakeEnv())
    expect(response.status).toBe(303)
    const cookie = response.headers.get('set-cookie')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
    // La galeta no ha de portar mai la contrasenya en clar.
    expect(cookie).not.toContain(PASSWORD)
  })

  it('un cop dins, ensenya les peces que esperen', async () => {
    const response = await handleReviewRoutes(
      get('/revisio', { cookie: `bondiari_revisio=${await cookieValue()}` }),
      fakeEnv(),
    )
    const body = await response.text()
    expect(body).toContain('Titular que encara no ha de ser públic')
    expect(body).toContain('Publica')
    expect(body).toContain('Descarta')
  })

  it('demana als cercadors que no la indexin', async () => {
    const response = await handleReviewRoutes(
      get('/revisio', { cookie: `bondiari_revisio=${await cookieValue()}` }),
      fakeEnv(),
    )
    expect(response.headers.get('x-robots-tag')).toContain('noindex')
    expect(await response.text()).toContain('name="robots" content="noindex, nofollow"')
  })

  it('una galeta falsificada no obre la porta', async () => {
    const response = await handleReviewRoutes(
      get('/revisio', { cookie: 'bondiari_revisio=aixo-me-ho-invento' }),
      fakeEnv(),
    )
    expect(await response.text()).toContain('Contrasenya')
  })
})

// ---------------------------------------------------------------------------

describe('la sala ensenya juntes les peces del mateix fet', () => {
  function pendent(id, title, source) {
    return {
      id,
      first_seen_at: '2026-08-15T06:00:00.000Z',
      payload_json: JSON.stringify({ id, title, source, url: `https://x/${id}`, body: [] }),
    }
  }

  it('les agrupa en LLEGIR, encara que ja fossin a la base de dades', async () => {
    // L'agrupació es calculava només en inserir, i l'INSERT OR IGNORE no toca
    // el que ja hi ha: les tres peces del mateix eclipsi que ja eren a la sala
    // no s'haurien ajuntat mai. Calculant-ho en llegir, no cal recuperar res.
    const files = [
      pendent('a', "Un eclipsi solar total visible des d'Espanya", 'Phys.org'),
      pendent('z', 'Un observatori nou obre a Nou Mèxic aquesta tardor', 'Aeon'),
      pendent('b', 'Un eclipsi solar total fotografiat des de Groenlàndia', 'NASA'),
    ]
    const res = await handleReviewRoutes(
      get('/revisio', { cookie: `bondiari_revisio=${await cookieValue()}` }),
      fakeEnv({ rows: files }),
    )
    const body = await res.text()

    // Totes tres hi són: no se n'amaga cap.
    for (const t of ['Espanya', 'Groenlàndia', 'Nou Mèxic']) {
      expect(body).toContain(t)
    }
    // La relacionada diu AMB QUINA s'assembla i de qui és.
    expect(body).toContain('Sembla que explica el mateix fet que')
    expect(body).toContain('Phys.org')
    // I va just després de la seva representant, no escampada per la pàgina.
    const posA = body.indexOf('Espanya')
    const posB = body.indexOf('Groenlàndia')
    const posZ = body.indexOf('Nou Mèxic')
    expect(posA).toBeLessThan(posB)
    expect(posB).toBeLessThan(posZ)
  })

  it('una peça sola no porta cap avís', async () => {
    const res = await handleReviewRoutes(
      get('/revisio', { cookie: `bondiari_revisio=${await cookieValue()}` }),
      fakeEnv({ rows: [pendent('u', 'Una notícia qualsevol i ben diferent', 'Quanta')] }),
    )
    expect(await res.text()).not.toContain('Sembla que explica el mateix fet')
  })
})
