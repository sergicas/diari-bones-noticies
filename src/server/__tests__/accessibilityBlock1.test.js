// Guardes reals del Bloc 1 (Fase 4): accessibilitat i impressió.
//
// Aquestes proves llegeixen els fitxers de debò i fallen si algú esborra
// o canvia les peces que fan funcionar el selector de mida, l'alta
// llegibilitat o la impressió neta. Substitueixen una versió anterior
// que només comprovava valors definits dins la mateixa prova.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const indexCss = readFileSync(join(rootDir, 'index.css'), 'utf8')
const appCss = readFileSync(join(rootDir, 'App.css'), 'utf8')
const appJsx = readFileSync(join(rootDir, 'App.jsx'), 'utf8')
const controls = readFileSync(
  join(rootDir, 'components', 'AccessibilityControls.jsx'),
  'utf8',
)
const storyDetail = readFileSync(
  join(rootDir, 'views', 'StoryDetailView.jsx'),
  'utf8',
)

describe('Fase 4 – Bloc 1: mida de lletra i alta llegibilitat', () => {
  it('les classes CSS del selector existeixen', () => {
    expect(indexCss).toMatch(/html\.font-size-large\s*{/)
    expect(indexCss).toMatch(/html\.font-size-xlarge\s*{/)
    expect(indexCss).toMatch(/html\.high-legibility\s*{/)
  })

  it('el component usa les claus de desat i les classes anunciades', () => {
    expect(controls).toContain('bondiari-font-size')
    expect(controls).toContain('bondiari-high-legibility')
    expect(controls).toContain('font-size-large')
    expect(controls).toContain('font-size-xlarge')
    expect(controls).toContain('high-legibility')
  })

  it('el component està muntat a App.jsx (cap funció fantasma)', () => {
    expect(appJsx).toContain('<AccessibilityControls />')
  })
})

describe('Fase 4 – Bloc 1: impressió neta per a aules', () => {
  it('el full d’estil d’impressió existeix i amaga la navegació', () => {
    expect(indexCss).toContain('@media print')
    expect(indexCss).toMatch(/@media print[\s\S]*\.site-header[\s\S]*display:\s*none/)
  })

  it('la fitxa d’article té el botó d’imprimir', () => {
    expect(storyDetail).toContain('window.print()')
  })
})

describe('Colors d’estat accessibles', () => {
  it('les variables d’estat que usen les vistes estan definides', () => {
    for (const name of ['--color-success', '--color-warning', '--color-error', '--color-primary']) {
      expect(indexCss).toContain(`${name}:`)
    }
  })
})

describe('Mode fosc: mai més a mitges', () => {
  // Juliol 2026: activar el mode fosc només a index.css (variables) sense
  // adaptar App.css (targetes amb blanc fixat) va deixar la portada
  // il·legible en fosc a producció. Regla: o tot o res.
  it('index.css no declara mode fosc mentre App.css no hi estigui adaptat', () => {
    // Es vigila només el codi actiu: els comentaris (com l'advertència que
    // explica per què no hi ha mode fosc) no compten.
    const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')
    const indexHasDark = stripComments(indexCss).includes('prefers-color-scheme: dark')
    const appHasDark = stripComments(appCss).includes('prefers-color-scheme: dark')
    if (indexHasDark) {
      expect(
        appHasDark,
        'index.css declara mode fosc però App.css no està adaptat: això va trencar la lectura en fosc el juliol de 2026',
      ).toBe(true)
    } else {
      expect(indexHasDark).toBe(false)
    }
  })
})
