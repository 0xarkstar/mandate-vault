import { describe, it, expect } from 'vitest'
import {
  tcaForTx,
  indexTcaByTx,
  aggregateFills,
  formatImprovementBps
} from '../src/lib/fills-tca'
import type { Fill } from '../src/lib/types'

const AAVE = '0x00000000000000000000000000000000000000a1' as const
const MM = '0x00000000000000000000000000000000000000b2' as const

function fill(txHash: string, improvementBps: number): Fill {
  return {
    txHash: txHash as `0x${string}`,
    blockNumber: 1n,
    mm: MM,
    assetIn: AAVE,
    assetOut: AAVE,
    amountIn: 1000n,
    amountOut: 1000n,
    oracleMidOut: 1000n,
    improvementBps
  }
}

describe('tcaForTx', () => {
  it('joins fills to a decision by tx hash (case-insensitive)', () => {
    const fills = [fill('0xAaa', 10), fill('0xbbb', 4), fill('0xaaa', 20)]
    const tca = tcaForTx(fills, '0xAAA')
    expect(tca.fillCount).toBe(2)
    expect(tca.avgImprovementBps).toBe(15)
  })

  it('returns an empty roll-up when no fills match', () => {
    const tca = tcaForTx([fill('0xaaa', 10)], '0xccc')
    expect(tca.fillCount).toBe(0)
    expect(tca.avgImprovementBps).toBe(0)
    expect(tca.fills).toHaveLength(0)
  })
})

describe('indexTcaByTx', () => {
  it('groups fills into a per-tx lookup with averaged improvement', () => {
    const idx = indexTcaByTx([fill('0xaaa', 10), fill('0xaaa', 30), fill('0xbbb', 5)])
    expect(idx.get('0xaaa')?.fillCount).toBe(2)
    expect(idx.get('0xaaa')?.avgImprovementBps).toBe(20)
    expect(idx.get('0xbbb')?.avgImprovementBps).toBe(5)
  })

  it('returns an empty map for no fills', () => {
    expect(indexTcaByTx([]).size).toBe(0)
  })
})

describe('aggregateFills', () => {
  it('averages improvement across all fills', () => {
    const agg = aggregateFills([fill('0xa', 0), fill('0xb', 10), fill('0xc', 20)])
    expect(agg.fillCount).toBe(3)
    expect(agg.avgImprovementBps).toBe(10)
  })

  it('is zero for an empty fill set', () => {
    expect(aggregateFills([])).toEqual({ fillCount: 0, avgImprovementBps: 0 })
  })
})

describe('formatImprovementBps', () => {
  it('prefixes positive improvement with +', () => {
    expect(formatImprovementBps(12.5)).toBe('+12.5 bps')
  })

  it('renders zero and negatives without a + sign', () => {
    expect(formatImprovementBps(0)).toBe('0 bps')
    expect(formatImprovementBps(-3.4)).toBe('-3.4 bps')
  })
})
