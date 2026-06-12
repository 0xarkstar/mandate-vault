import type { Fill } from './types'

/** Per-decision TCA roll-up: the fills that settled in that decision's tx. */
export interface DecisionTca {
  /** Number of RFQ fills joined to this decision. */
  fillCount: number
  /** Mean fill-vs-mid improvement across the decision's fills, in bps. */
  avgImprovementBps: number
  /** The individual fills, newest blocks first (input order preserved). */
  fills: Fill[]
}

/** Aggregate improvement stats across a whole set of fills. */
export interface FillAggregate {
  fillCount: number
  avgImprovementBps: number
}

/**
 * Join fills to a decision by transaction hash. A vault's rebalance tx may emit
 * several QuoteFilled events (one per asset leg); they all belong to the same
 * decision. Comparison is case-insensitive on the hex hash.
 */
export function tcaForTx(fills: readonly Fill[], txHash: string): DecisionTca {
  const target = txHash.toLowerCase()
  const matched = fills.filter((f) => f.txHash.toLowerCase() === target)
  return {
    fillCount: matched.length,
    avgImprovementBps: meanImprovement(matched),
    fills: matched
  }
}

/**
 * Build a txHash → TCA lookup for a list of fills, so a timeline can attach
 * per-decision TCA without re-scanning the full fill array for every row.
 */
export function indexTcaByTx(fills: readonly Fill[]): Map<string, DecisionTca> {
  const byTx = new Map<string, Fill[]>()
  for (const f of fills) {
    const key = f.txHash.toLowerCase()
    const list = byTx.get(key)
    if (list) list.push(f)
    else byTx.set(key, [f])
  }
  const out = new Map<string, DecisionTca>()
  for (const [key, list] of byTx) {
    out.set(key, { fillCount: list.length, avgImprovementBps: meanImprovement(list), fills: list })
  }
  return out
}

/** Aggregate improvement across every fill (used for arena scoring). */
export function aggregateFills(fills: readonly Fill[]): FillAggregate {
  return { fillCount: fills.length, avgImprovementBps: meanImprovement(fills) }
}

/** Format a signed improvement-bps number as a display string, e.g. "+12.5 bps". */
export function formatImprovementBps(bps: number): string {
  const rounded = Math.round(bps * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${trim(rounded)} bps`
}

// ---------------------------------------------------------------- internals

function meanImprovement(fills: readonly Fill[]): number {
  if (fills.length === 0) return 0
  const sum = fills.reduce((acc, f) => acc + f.improvementBps, 0)
  return sum / fills.length
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n)
}
