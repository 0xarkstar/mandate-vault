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
  const { avgImprovementBps } = aggregateFills(fills)

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
