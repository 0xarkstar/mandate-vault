import type { Address } from 'viem'
import type { Leg } from './types.js'

/**
 * Mirrors MandateVault._executeAllocation off-chain so the agent can size RFQ
 * quotes to the legs the vault will execute. Pass 1 (sell overweight sleeves)
 * matches the contract's bigint math exactly; pass 2 (buy underweight) caps
 * spend at the safe balance projected with MID fills — actual RFQ fills are
 * ≥ mid (or the slippage gate freezes), so the on-chain cap is never tighter
 * than projected here. Pure bigint arithmetic on the same on-chain inputs
 * (balances, oracle prices, totalValue); NO LLM, no floating point.
 */

const WAD = 10n ** 18n
const BPS = 10_000n

export interface LegInputs {
  /** Mandate assets; index 0 is the safe asset. */
  assets: Address[]
  /** Raw token balances keyed by lowercase asset address. */
  balances: Record<string, bigint>
  /** Oracle prices (1e18) keyed by lowercase asset address. */
  prices: Record<string, bigint>
  /** Total vault value (1e18 USD), as the contract computes it. */
  totalValue: bigint
  /** Clamped target allocation (bps, sums to 10000). */
  targetBps: number[]
}

/**
 * Compute the swap legs of a rebalance: pass 1 sells overweight non-safe
 * sleeves into the safe asset, pass 2 buys underweight non-safe sleeves with
 * the safe asset. Mirrors the contract exactly (including rounding and the
 * order of operations).
 */
export function computeLegs(inputs: LegInputs): Leg[] {
  const { assets, balances, prices, totalValue, targetBps } = inputs
  if (assets.length !== targetBps.length) {
    throw new Error(`computeLegs: assets/target length mismatch (${assets.length} vs ${targetBps.length})`)
  }
  if (totalValue === 0n) return []

  const safe = assets[0]!
  const priceOf = (a: Address): bigint => {
    const p = prices[a.toLowerCase()]
    if (p == null || p === 0n) throw new Error(`computeLegs: missing/zero price for ${a}`)
    return p
  }
  const balOf = (a: Address): bigint => balances[a.toLowerCase()] ?? 0n

  const legs: Leg[] = []
  const safePrice = priceOf(safe)

  for (let i = 1; i < assets.length; i++) {
    const a = assets[i]!
    const priceA = priceOf(a)
    const curVal = (balOf(a) * priceA) / WAD
    const tgtVal = (totalValue * BigInt(targetBps[i]!)) / BPS
    if (curVal > tgtVal) {
      const sellAmount = ((curVal - tgtVal) * WAD) / priceA
      if (sellAmount > 0n) {
        legs.push({ assetIn: a, assetOut: safe, amountIn: sellAmount, midOut: (sellAmount * priceA) / safePrice })
      }
    }
  }

  // Pass 2 caps spend at the safe balance AFTER pass-1 sells; assume mid fills
  // for the projection (RFQ fills are >= mid or the gate freezes, so the cap
  // can only be looser on-chain than projected here).
  let safeBal = balOf(safe) + legs.reduce((acc, l) => acc + l.midOut, 0n)
  for (let i = 1; i < assets.length; i++) {
    const a = assets[i]!
    const priceA = priceOf(a)
    const curVal = (balOf(a) * priceA) / WAD
    const tgtVal = (totalValue * BigInt(targetBps[i]!)) / BPS
    if (tgtVal > curVal) {
      let spendSafe = ((tgtVal - curVal) * WAD) / safePrice
      if (spendSafe > safeBal) spendSafe = safeBal
      if (spendSafe > 0n) {
        legs.push({ assetIn: safe, assetOut: a, amountIn: spendSafe, midOut: (spendSafe * safePrice) / priceA })
        safeBal -= spendSafe
      }
    }
  }

  return legs
}
