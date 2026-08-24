import { describe, expect, it, vi } from 'vitest'
import {
  esperaFeina,
  esperaLotVisible,
  RefrescNoConfirmat,
} from '../../../scripts/lib/esperaRefresc.mjs'

// CAP ESPERA POT ACABAR DIENT QUE SÍ SENSE ESTAR-NE SEGURA.
//
// Els scripts imprimien "✓ Radar refrescat" en exhaurir-se el temps d'espera,
// amb el lot vell a la mà. Arribar al límit no confirma res: Cloudflare
// documenta que la propagació de KV pot passar del minut.

function respostaFeina(estats) {
  let i = 0
  return vi.fn(async () => {
    const estat = estats[Math.min(i++, estats.length - 1)]
    return { ok: true, async json() { return estat } }
  })
}

const rapid = { intervalMs: 1, maxMs: 40 }

describe('esperar la feina de la cua', () => {
  it('torna la feina quan acaba bé', async () => {
    const feina = await esperaFeina('https://x/estat', 'clau', {
      ...rapid,
      fetchImpl: respostaFeina([
        { status: 'processing' },
        { status: 'completed', result: { cache: 'refresh', storyCount: 3 } },
      ]),
    })
    expect(feina.status).toBe('completed')
    expect(feina.result.storyCount).toBe(3)
  })

  it('si la feina falla, atura amb el motiu', async () => {
    await expect(
      esperaFeina('https://x/estat', 'clau', {
        ...rapid,
        fetchImpl: respostaFeina([{ status: 'failed', error: 'cap font no respon' }]),
      }),
    ).rejects.toThrow(/cap font no respon/)
  })

  it('si s’exhaureix el temps, NO diu que hagi acabat', async () => {
    await expect(
      esperaFeina('https://x/estat', 'clau', {
        ...rapid,
        fetchImpl: respostaFeina([{ status: 'processing' }]),
      }),
    ).rejects.toBeInstanceOf(RefrescNoConfirmat)
  })

  it('envia el testimoni a cada consulta', async () => {
    const fetchImpl = respostaFeina([{ status: 'completed' }])
    await esperaFeina('https://x/estat', 'el-testimoni', { ...rapid, fetchImpl })
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer el-testimoni')
  })
})

describe('esperar que el lot públic sigui visible', () => {
  it('si la data arriba, torna el lot', async () => {
    let n = 0
    const llegeixLot = async () =>
      n++ === 0
        ? { updatedAt: '2026-08-14T06:00:00.000Z', stories: [] }
        : { updatedAt: '2026-08-14T07:00:00.000Z', stories: [1] }
    const lot = await esperaLotVisible(llegeixLot, '2026-08-14T07:00:00.000Z', rapid)
    expect(lot.stories).toHaveLength(1)
  })

  it('si la data NO arriba dins del límit, atura amb error', async () => {
    // Abans, en aquest cas, l'script continuava amb el lot vell i imprimia ✓.
    const llegeixLot = async () => ({ updatedAt: '2026-08-14T06:00:00.000Z', stories: [] })
    await expect(
      esperaLotVisible(llegeixLot, '2026-08-14T07:00:00.000Z', rapid),
    ).rejects.toBeInstanceOf(RefrescNoConfirmat)
  })

  it('una data posterior a l’esperada també val', async () => {
    const llegeixLot = async () => ({ updatedAt: '2026-08-14T09:00:00.000Z', stories: [] })
    await expect(
      esperaLotVisible(llegeixLot, '2026-08-14T07:00:00.000Z', rapid),
    ).resolves.toBeTruthy()
  })

  it('sense data esperada, no espera res', async () => {
    const llegeixLot = vi.fn(async () => ({ updatedAt: null, stories: [] }))
    await esperaLotVisible(llegeixLot, null, rapid)
    expect(llegeixLot).toHaveBeenCalledTimes(1)
  })
})
