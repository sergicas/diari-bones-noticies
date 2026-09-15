import { describe, expect, it } from 'vitest'
import {
  getScheduledRefreshDelay,
  scheduledRefreshGraceMs,
} from '../../lib/refresh-schedule.js'

describe('sincronització de la portada amb l’edició programada', () => {
  it('espera fins a la pròxima edició i hi afegeix un marge curt', () => {
    const now = Date.parse('2026-09-11T16:00:00.000Z')
    const nextRefreshAt = '2026-09-11T17:00:00.000Z'

    expect(getScheduledRefreshDelay(nextRefreshAt, now)).toBe(
      60 * 60 * 1000 + scheduledRefreshGraceMs,
    )
  })

  it('actualitza immediatament si l’hora programada ja ha passat', () => {
    const now = Date.parse('2026-09-11T17:02:00.000Z')

    expect(
      getScheduledRefreshDelay('2026-09-11T17:00:00.000Z', now),
    ).toBe(0)
  })

  it('ignora una data invàlida i conserva la comprovació horària', () => {
    expect(getScheduledRefreshDelay('data-invàlida')).toBeNull()
  })
})
