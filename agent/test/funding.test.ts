import { describe, expect, it } from 'vitest'
import { buildFundingSnapshot, computeMean } from '../src/feeds/funding.js'

describe('computeMean', () => {
  it('averages the last `window` rates and formats to 8 decimals', () => {
    // 24 rates: first three are noise, last 21 average to 0.0001
    const rates = ['9', '9', '9', ...Array.from({ length: 21 }, () => '0.0001')]
    expect(computeMean(rates, 21)).toBe('0.00010000')
  })

  it('uses all rates when fewer than the window exist', () => {
    expect(computeMean(['0.0002', '0.0004'], 21)).toBe('0.00030000')
  })

  it('returns "0" for an empty history', () => {
    expect(computeMean([], 21)).toBe('0')
  })

  it('throws on a non-numeric rate', () => {
    expect(() => computeMean(['0.0001', 'oops'])).toThrow(/non-numeric/)
  })
})

describe('buildFundingSnapshot', () => {
  it('takes the last historical rate as lastRate and computes mean7d', () => {
    const history = Array.from({ length: 21 }, (_, i) => (i === 20 ? '0.0005' : '0.0001'))
    const snap = buildFundingSnapshot(history, '0.0009', '3000.50')
    expect(snap.lastRate).toBe('0.0005')
    expect(snap.markPrice).toBe('3000.50')
    // mean of twenty 0.0001 + one 0.0005 = (0.0020 + 0.0005)/21
    expect(snap.mean7d).toBe('0.00011905')
  })

  it('falls back to premium lastFundingRate when history is empty', () => {
    const snap = buildFundingSnapshot([], '0.0007', '3100')
    expect(snap.lastRate).toBe('0.0007')
    expect(snap.mean7d).toBe('0')
  })
})
