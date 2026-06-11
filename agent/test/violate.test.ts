import { describe, expect, it } from 'vitest'
import { clamp } from '@mandate-vault/clamp-core'
import { buildViolateTarget } from '../src/violate.js'

describe('buildViolateTarget', () => {
  it('builds a sum-10000, out-of-bounds 2-asset target (safe sleeve emptied)', () => {
    const t = buildViolateTarget(2)
    expect(t).toEqual([0, 10_000])
    expect(t.reduce((a, b) => a + b, 0)).toBe(10_000)
  })

  it('builds a sum-10000, out-of-bounds 3-asset target', () => {
    const t = buildViolateTarget(3)
    expect(t).toEqual([0, 10_000, 0])
    expect(t.reduce((a, b) => a + b, 0)).toBe(10_000)
  })

  it('violates the conservative mandate minBps[0] (so the on-chain re-check reverts)', () => {
    // Conservative: mUSD 70-100%, mMETH 0-30%
    const bounds = { minBps: [7000, 0], maxBps: [10_000, 3000] }
    const raw = buildViolateTarget(2)
    // The raw target is outside bounds: clamp WOULD change it (proof of violation).
    const { violations } = clamp(raw, bounds)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.map((v) => v.index)).toContain(0)
  })

  it('returns [10000] for a single-asset mandate (sum must still be 10000)', () => {
    expect(buildViolateTarget(1)).toEqual([10_000])
  })

  it('throws on a non-positive asset count', () => {
    expect(() => buildViolateTarget(0)).toThrow(/positive integer/)
    expect(() => buildViolateTarget(-1)).toThrow(/positive integer/)
  })
})
