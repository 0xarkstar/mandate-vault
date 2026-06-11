import { describe, expect, it } from 'vitest'
import {
  buildFundingSnapshot,
  computeMean,
  parseBinanceFunding,
  parseBybitFunding
} from '../src/feeds/funding.js'

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

describe('parseBybitFunding', () => {
  const ticker = {
    retCode: 0,
    result: { list: [{ symbol: 'ETHUSDT', fundingRate: '0.00004552', markPrice: '1678.97' }] }
  }

  it('reverses the newest-first history so lastRate is the most recent rate', () => {
    const history = {
      retCode: 0,
      result: {
        list: [
          { symbol: 'ETHUSDT', fundingRate: '0.0003', fundingRateTimestamp: '1781193600000' }, // newest
          { symbol: 'ETHUSDT', fundingRate: '0.0002', fundingRateTimestamp: '1781164800000' },
          { symbol: 'ETHUSDT', fundingRate: '0.0001', fundingRateTimestamp: '1781136000000' } // oldest
        ]
      }
    }
    const snap = parseBybitFunding(history, ticker)
    expect(snap.lastRate).toBe('0.0003')
    expect(snap.mean7d).toBe('0.00020000')
    expect(snap.markPrice).toBe('1678.97')
  })

  it('throws when retCode is non-zero', () => {
    const bad = { retCode: 10001, result: { list: [] } }
    expect(() => parseBybitFunding(bad, ticker)).toThrow(/retCode 10001/)
  })

  it('throws when the ticker list is empty', () => {
    const history = { retCode: 0, result: { list: [] } }
    const emptyTicker = { retCode: 0, result: { list: [] } }
    expect(() => parseBybitFunding(history, emptyTicker)).toThrow(/ticker list is empty/)
  })

  it('rejects malformed payloads via zod', () => {
    expect(() => parseBybitFunding({ nope: true }, ticker)).toThrow()
  })
})

describe('parseBinanceFunding', () => {
  it('keeps the oldest-first ordering as-is', () => {
    const history = [
      { symbol: 'ETHUSDT', fundingTime: 1, fundingRate: '0.0001' },
      { symbol: 'ETHUSDT', fundingTime: 2, fundingRate: '0.0005' }
    ]
    const premium = { symbol: 'ETHUSDT', markPrice: '1650.00', lastFundingRate: '0.0009' }
    const snap = parseBinanceFunding(history, premium)
    expect(snap.lastRate).toBe('0.0005')
    expect(snap.markPrice).toBe('1650.00')
  })
})
