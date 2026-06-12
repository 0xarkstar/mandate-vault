import { describe, expect, it } from 'vitest'
import type { Address, Hex } from 'viem'
import { selectBest, slippageGate } from '../src/execute/route.js'
import type { SignedQuote } from '../src/execute/types.js'

const WAD = 10n ** 18n

function sq(amountIn: bigint, amountOut: bigint, mmName: string): SignedQuote {
  return {
    quote: {
      assetIn: '0x0000000000000000000000000000000000000001' as Address,
      assetOut: '0x0000000000000000000000000000000000000002' as Address,
      amountIn,
      amountOut,
      expiry: 9_999_999_999n,
      mm: '0x00000000000000000000000000000000000000aa' as Address,
      nonce: 1n
    },
    signature: ('0x' + '11'.repeat(65)) as Hex,
    mmName
  }
}

describe('selectBest', () => {
  it('returns null for an empty list', () => {
    expect(selectBest([])).toBeNull()
  })

  it('picks the higher output for equal sizes', () => {
    const tight = sq(1650n * WAD, 1_001n * WAD, 'tight')
    const wide = sq(1650n * WAD, 996n * WAD, 'wide')
    expect(selectBest([wide, tight])?.mmName).toBe('tight')
  })

  it('normalizes by amountIn for unequal sizes', () => {
    // small quote with better RATE must beat a bigger quote with a worse rate
    const betterRate = sq(100n * WAD, 101n * WAD, 'better-rate') // 1.01
    const biggerSize = sq(1000n * WAD, 1_000n * WAD, 'bigger') // 1.00
    expect(selectBest([biggerSize, betterRate])?.mmName).toBe('better-rate')
  })
})

describe('slippageGate', () => {
  const mid = 1000n * WAD

  it('fills when better than mid (negative slippage = improvement)', () => {
    const r = slippageGate(sq(1n, 1001n * WAD, 'tight'), mid, 50)
    expect(r.action).toBe('fill')
    expect(r.slippageBps).toBeLessThan(0)
  })

  it('fills when slippage is within the bound', () => {
    const r = slippageGate(sq(1n, 996n * WAD, 'ok'), mid, 50) // 40bps worse
    expect(r.action).toBe('fill')
    expect(r.slippageBps).toBe(40)
  })

  it('freezes when slippage exceeds the bound — never dumps', () => {
    const r = slippageGate(sq(1n, 990n * WAD, 'bad'), mid, 50) // 100bps worse
    expect(r.action).toBe('freeze')
    if (r.action === 'freeze') expect(r.reason).toContain('holding')
  })

  it('freezes when mid is unavailable', () => {
    const r = slippageGate(sq(1n, 1000n * WAD, 'x'), 0n, 50)
    expect(r.action).toBe('freeze')
  })
})
