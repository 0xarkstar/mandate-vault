import { describe, it, expect } from 'vitest'
import { computeRunway, parseBurn } from '../src/lib/runway'

const WAD = 10n ** 18n

describe('parseBurn', () => {
  it('parses a positive number', () => {
    expect(parseBurn('5000')).toBe(5000)
    expect(parseBurn('  1200.5 ')).toBe(1200.5)
  })

  it('returns 0 for non-positive or invalid input', () => {
    expect(parseBurn('0')).toBe(0)
    expect(parseBurn('-10')).toBe(0)
    expect(parseBurn('abc')).toBe(0)
    expect(parseBurn('')).toBe(0)
  })
})

describe('computeRunway', () => {
  it('divides safe sleeve by monthly burn', () => {
    // 60,000 mUSD sleeve / 5,000 burn = 12 months
    const r = computeRunway(60_000n * WAD, '5000')
    expect(r.months).toBe(12)
    expect(r.label).toBe('≈ 12 months')
  })

  it('rounds to one decimal', () => {
    // 10,000 / 3,000 = 3.333… → 3.3
    const r = computeRunway(10_000n * WAD, '3000')
    expect(r.months).toBe(3.3)
    expect(r.label).toBe('≈ 3.3 months')
  })

  it('returns infinite runway when burn is zero/invalid', () => {
    const r = computeRunway(10_000n * WAD, '0')
    expect(r.months).toBeNull()
    expect(r.label).toContain('∞')
  })

  it('handles a zero sleeve', () => {
    const r = computeRunway(0n, '1000')
    expect(r.months).toBe(0)
  })
})
