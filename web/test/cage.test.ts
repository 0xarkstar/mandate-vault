import { describe, it, expect } from 'vitest'
import { buildCageDiagram, cageHitRate } from '../src/lib/cage'

describe('buildCageDiagram', () => {
  it('marks an asset as cage-hit and out-of-band when the clamp pulled it inside', () => {
    // raw proposes 90% risk asset, mandate allows max 70%, clamp pulls to 70
    const d = buildCageDiagram([1000, 9000], [3000, 7000], [3000, 0], [10_000, 7000])
    expect(d.anyCageHit).toBe(true)
    expect(d.rows[1]).toMatchObject({
      index: 1,
      minBps: 0,
      maxBps: 7000,
      rawBps: 9000,
      clampedBps: 7000,
      deltaBps: -2000,
      cageHit: true,
      rawOutOfBand: true
    })
  })

  it('reports no cage hit when the proposal was already within bounds', () => {
    const d = buildCageDiagram([4000, 6000], [4000, 6000], [3000, 3000], [7000, 7000])
    expect(d.anyCageHit).toBe(false)
    expect(d.rows.every((r) => !r.cageHit && !r.rawOutOfBand)).toBe(true)
  })

  it('defaults a missing band to the full [0,10000] range', () => {
    const d = buildCageDiagram([5000, 5000], [5000, 5000], [], [])
    expect(d.rows[0]).toMatchObject({ minBps: 0, maxBps: 10_000, rawOutOfBand: false })
  })
})

describe('cageHitRate', () => {
  it('is the fraction of assets that were clamped', () => {
    const d = buildCageDiagram([1000, 9000], [3000, 7000], [3000, 0], [10_000, 7000])
    expect(cageHitRate(d)).toBe(1) // both legs moved (deficit repair + clamp)
  })

  it('is 0 for an empty diagram', () => {
    expect(cageHitRate({ rows: [], anyCageHit: false })).toBe(0)
  })
})
