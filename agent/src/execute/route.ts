import type { SignedQuote } from './types.js'

/**
 * Quote selection + slippage gate. Pure arithmetic — the routing decision is
 * deterministic and replayable. NO LLM on this path (harness invariant #1).
 */

const BPS = 10_000n

/** Pick the quote with the best output. Returns null when no quotes survive. */
export function selectBest(quotes: SignedQuote[]): SignedQuote | null {
  if (quotes.length === 0) return null
  return quotes.reduce((best, q) => {
    // Normalize by amountIn so differently-sized quotes compare fairly:
    // q better than best ⇔ q.out/q.in > best.out/best.in (cross-multiplied).
    const qScore = q.quote.amountOut * best.quote.amountIn
    const bestScore = best.quote.amountOut * q.quote.amountIn
    return qScore > bestScore ? q : best
  })
}

export type GateResult =
  | { action: 'fill'; slippageBps: number }
  | { action: 'freeze'; slippageBps: number; reason: string }

/**
 * Slippage gate: compare the best fill against oracle mid. Positive slippage
 * (worse than mid) beyond `maxSlippageBps` → FREEZE the leg (no fill — funds
 * stay put; never dump). Negative slippage = price improvement.
 */
export function slippageGate(best: SignedQuote, midOut: bigint, maxSlippageBps: number): GateResult {
  if (midOut <= 0n) {
    return { action: 'freeze', slippageBps: 0, reason: 'oracle mid unavailable (midOut=0)' }
  }
  // Pro-rate the quote's output to the mid's reference size if they differ.
  const quotedOutAtMidSize = best.quote.amountOut
  const slippageBps = Number(((midOut - quotedOutAtMidSize) * BPS) / midOut)
  if (slippageBps > maxSlippageBps) {
    return {
      action: 'freeze',
      slippageBps,
      reason: `best quote ${slippageBps}bps worse than oracle mid (max ${maxSlippageBps}bps) — holding, not dumping`
    }
  }
  return { action: 'fill', slippageBps }
}
