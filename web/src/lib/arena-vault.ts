import type { Decision, Fill } from './types'
import { extractTargetBps } from './clamp-delta'
import { extractLlmFallback } from './snapshot-meta'
import { buildCageDiagram, cageHitRate } from './cage'
import { aggregateFills } from './fills-tca'
import { arenaScore, type ArenaScore } from './arena-score'

/** A vault's execution-quality summary as shown in the arena leaderboard. */
export interface ArenaRow {
  decisionCount: number
  avgImprovementBps: number
  cageHitRate: number
  fallbackRate: number
  score: ArenaScore
}

/**
 * Reduce a vault's on-chain decision log + RFQ fills into arena-scoring inputs,
 * then score it. All metrics are behavioural (execution quality), never alpha:
 *  - avgImprovementBps: mean fill-vs-mid improvement across every RFQ fill
 *  - cageHitRate: mean per-decision fraction of assets the clamp had to move
 *  - fallbackRate: fraction of decisions that used the deterministic LLM fallback
 *
 * Pure over its inputs. Mandate bounds are needed to decide which proposed legs
 * were out-of-band; pass the vault's `[minBps, maxBps]`.
 */
export function summarizeVault(
  decisions: readonly Decision[],
  fills: readonly Fill[],
  minBps: readonly number[],
  maxBps: readonly number[]
): ArenaRow {
  const decisionCount = decisions.length

  // No on-chain behavior → nothing to score. Rank below any vault with data
  // instead of awarding the "did nothing wrong" baseline.
  if (decisionCount === 0) {
    return {
      decisionCount: 0,
      avgImprovementBps: 0,
      cageHitRate: 0,
      fallbackRate: 0,
      score: { score: 0, execution: 0, mandateFit: 0, autonomy: 0 }
    }
  }

  // QuoteFilled events are venue-wide; only the fills settled inside THIS
  // vault's rebalance txs belong to its score.
  const decisionTxs = new Set(decisions.map((d) => d.txHash.toLowerCase()))
  const vaultFills = fills.filter((f) => decisionTxs.has(f.txHash.toLowerCase()))
  const { avgImprovementBps } = aggregateFills(vaultFills)

  const cageHitRateValue = mean(
    decisions.map((d) => {
      const raw = extractTargetBps(d.rawProposalJson)
      return cageHitRate(buildCageDiagram(raw, d.clampedAllocBps, minBps, maxBps))
    })
  )

  const fallbackRate =
    decisionCount === 0
      ? 0
      : decisions.filter((d) => extractLlmFallback(d.snapshotJson)).length / decisionCount

  const score = arenaScore({ avgImprovementBps, cageHitRate: cageHitRateValue, fallbackRate })

  return { decisionCount, avgImprovementBps, cageHitRate: cageHitRateValue, fallbackRate, score }
}

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
