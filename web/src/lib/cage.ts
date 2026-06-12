import { computeClampDelta } from './clamp-delta'

/**
 * One asset row of the cage diagram: the mandate-allowed [minBps, maxBps] band,
 * where the AI's raw proposal landed, where the deterministic clamp put it, and
 * whether the cage actually bit for this asset.
 */
export interface CageRow {
  index: number
  minBps: number
  maxBps: number
  rawBps: number
  clampedBps: number
  /** clampedBps - rawBps; non-zero only when the cage moved this asset. */
  deltaBps: number
  cageHit: boolean
  /** True when the raw proposal sat outside [minBps, maxBps] (cage was needed). */
  rawOutOfBand: boolean
}

export interface CageDiagram {
  rows: CageRow[]
  /** True when the clamp moved at least one asset. */
  anyCageHit: boolean
}

/**
 * Build the cage diagram model for a single decision. Pairs the raw proposal
 * against the clamped on-chain allocation and overlays the mandate band. Pure
 * over its inputs; missing band entries default to the full [0, 10000] range so
 * the UI degrades gracefully rather than throwing.
 */
export function buildCageDiagram(
  rawBps: readonly number[],
  clampedBps: readonly number[],
  minBps: readonly number[],
  maxBps: readonly number[]
): CageDiagram {
  const delta = computeClampDelta(rawBps, clampedBps)
  const rows: CageRow[] = delta.rows.map((r) => {
    const min = minBps[r.index] ?? 0
    const max = maxBps[r.index] ?? 10_000
    return {
      index: r.index,
      minBps: min,
      maxBps: max,
      rawBps: r.raw,
      clampedBps: r.clamped,
      deltaBps: r.delta,
      cageHit: r.changed,
      rawOutOfBand: r.raw < min || r.raw > max
    }
  })
  return { rows, anyCageHit: rows.some((r) => r.cageHit) }
}

/**
 * Fraction (0–1) of a decision's assets whose raw proposal was clamped. Used
 * as the per-decision cage-hit rate input to arena scoring.
 */
export function cageHitRate(diagram: CageDiagram): number {
  if (diagram.rows.length === 0) return 0
  const hits = diagram.rows.filter((r) => r.cageHit).length
  return hits / diagram.rows.length
}
