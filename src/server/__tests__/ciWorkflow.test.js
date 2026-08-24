import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')

describe('GitHub Actions — verificació de totes les branques', () => {
  it('executa Verify en qualsevol push de branca, també feat/*', () => {
    expect(workflow).toMatch(/push:\s+branches:\s+- ['"]\*\*['"]/)
  })

  it('manté la verificació de pull requests', () => {
    expect(workflow).toMatch(/^\s{2}pull_request:\s*$/m)
  })
})
