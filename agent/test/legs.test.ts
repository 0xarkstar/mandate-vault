import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { computeLegs } from '../src/execute/legs.js'

const WAD = 10n ** 18n

const mUSD = '0x0000000000000000000000000000000000000001' as Address
const mMETH = '0x0000000000000000000000000000000000000002' as Address
const mMNT = '0x0000000000000000000000000000000000000003' as Address

const PRICES = {
  [mUSD]: WAD, // $1
  [mMETH]: 1650n * WAD, // $1650
  [mMNT]: (6n * WAD) / 10n // $0.60
}

describe('computeLegs', () => {
  it('matches the on-chain buy leg for the 30/70 forge scenario', () => {
    // $10k all in mUSD, target 30/70 → one buy leg: 7000 mUSD → mMETH
    const legs = computeLegs({
      assets: [mUSD, mMETH],
      balances: { [mUSD]: 10_000n * WAD, [mMETH]: 0n },
      prices: PRICES,
      totalValue: 10_000n * WAD,
      targetBps: [3000, 7000]
    })
    expect(legs).toHaveLength(1)
    expect(legs[0]!.assetIn).toBe(mUSD)
    expect(legs[0]!.assetOut).toBe(mMETH)
    expect(legs[0]!.amountIn).toBe(7000n * WAD)
    expect(legs[0]!.midOut).toBe((7000n * WAD * WAD) / (1650n * WAD))
  })

  it('produces a sell leg when a sleeve is overweight', () => {
    // 70% mMETH, target 30% mMETH → sell ~40% of value in mMETH
    const methBal = (7000n * WAD * WAD) / (1650n * WAD)
    const legs = computeLegs({
      assets: [mUSD, mMETH],
      balances: { [mUSD]: 3000n * WAD, [mMETH]: methBal },
      prices: PRICES,
      totalValue: 3000n * WAD + (methBal * 1650n * WAD) / WAD,
      targetBps: [7000, 3000]
    })
    expect(legs).toHaveLength(1)
    expect(legs[0]!.assetIn).toBe(mMETH)
    expect(legs[0]!.assetOut).toBe(mUSD)
    // ~4000 USD worth of mMETH
    const valueSold = (legs[0]!.amountIn * 1650n * WAD) / WAD
    expect(valueSold).toBeGreaterThan(3990n * WAD)
    expect(valueSold).toBeLessThan(4010n * WAD)
  })

  it('handles sell + buy in one rebalance (3-asset)', () => {
    // overweight mMETH, underweight mMNT
    const methBal = (8000n * WAD * WAD) / (1650n * WAD)
    const tv = 2000n * WAD + (methBal * 1650n * WAD) / WAD
    const legs = computeLegs({
      assets: [mUSD, mMETH, mMNT],
      balances: { [mUSD]: 2000n * WAD, [mMETH]: methBal, [mMNT]: 0n },
      prices: PRICES,
      totalValue: tv,
      targetBps: [2000, 6000, 2000]
    })
    expect(legs).toHaveLength(2)
    expect(legs[0]!.assetIn).toBe(mMETH) // sell first (pass 1)
    expect(legs[1]!.assetIn).toBe(mUSD) // then buy (pass 2)
    expect(legs[1]!.assetOut).toBe(mMNT)
  })

  it('returns no legs when already on target', () => {
    const legs = computeLegs({
      assets: [mUSD, mMETH],
      balances: { [mUSD]: 10_000n * WAD, [mMETH]: 0n },
      prices: PRICES,
      totalValue: 10_000n * WAD,
      targetBps: [10_000, 0]
    })
    expect(legs).toHaveLength(0)
  })

  it('returns no legs for an empty vault', () => {
    const legs = computeLegs({
      assets: [mUSD, mMETH],
      balances: { [mUSD]: 0n, [mMETH]: 0n },
      prices: PRICES,
      totalValue: 0n,
      targetBps: [3000, 7000]
    })
    expect(legs).toHaveLength(0)
  })

  it('throws on length mismatch', () => {
    expect(() =>
      computeLegs({
        assets: [mUSD, mMETH],
        balances: {},
        prices: PRICES,
        totalValue: WAD,
        targetBps: [10_000]
      })
    ).toThrow(/length mismatch/)
  })

  it('throws on missing price', () => {
    expect(() =>
      computeLegs({
        assets: [mUSD, mMETH],
        balances: { [mUSD]: WAD, [mMETH]: WAD },
        prices: { [mUSD]: WAD },
        totalValue: 2n * WAD,
        targetBps: [5000, 5000]
      })
    ).toThrow(/missing\/zero price/)
  })
})
