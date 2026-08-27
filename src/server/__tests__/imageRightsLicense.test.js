import { describe, expect, it } from 'vitest'
import { hasPermissiveImageLicense } from '../../lib/imageRules.js'

describe('llicències d’imatge fail-closed', () => {
  it.each([
    'CC BY 4.0',
    'CC-BY-SA-4.0',
    'CC0 1.0',
    'Public domain (NASA)',
    'Domini públic',
  ])('accepta la llicència reutilitzable %s', (license) => {
    expect(hasPermissiveImageLicense(license)).toBe(true)
  })

  it.each([
    'CC BY-NC 4.0',
    'CC BY-ND 4.0',
    'CC BY-NC-ND 3.0',
    'Creative Commons NonCommercial',
    'All rights reserved',
    'llicència lliure',
    '',
  ])('rebutja la llicència no lliure o ambigua %s', (license) => {
    expect(hasPermissiveImageLicense(license)).toBe(false)
  })
})
