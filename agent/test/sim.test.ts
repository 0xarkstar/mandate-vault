import { describe, expect, it } from 'vitest'
import { methPricePath } from '../src/sim.js'

const BASE = 3_000n * 10n ** 18n

describe('methPricePath', () => {
  it('produces the requested number of steps', () => {
    expect(methPricePath(BASE, 12).length).toBe(12)
  })

  it('is deterministic for a fixed seed', () => {
    expect(methPricePath(BASE, 12, 42)).toEqual(methPricePath(BASE, 12, 42))
  })

  it('differs across seeds', () => {
    const a = methPricePath(BASE, 12, 1)
    const b = methPricePath(BASE, 12, 2)
    expect(a).not.toEqual(b)
  })

  it('never drops below the floor (base/2)', () => {
    for (const p of methPricePath(BASE, 50, 7)) {
      expect(p).toBeGreaterThanOrEqual(BASE / 2n)
    }
  })

  it('stays within a sane band of the base price', () => {
    for (const p of methPricePath(BASE, 30, 3)) {
      expect(p).toBeGreaterThan(0n)
      expect(p).toBeLessThan(BASE * 5n)
    }
  })
})
