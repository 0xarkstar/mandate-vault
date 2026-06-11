import type { MandateBounds } from './schema.js'

export interface ClampViolation {
  index: number
  target: number
  min: number
  max: number
}

export interface ClampResult {
  clampedBps: number[]
  violations: ClampViolation[]
  /** True when the raw proposal was already fully inside the mandate. */
  unchanged: boolean
}

const TOTAL = 10_000

/**
 * Deterministically clamp an LLM allocation proposal into mandate bounds.
 *
 * Algorithm (must stay byte-deterministic — the verifier replays it):
 *  1. Per-asset clamp into [min, max]; record violations.
 *  2. Repair the sum to exactly 10000 by greedy index-order adjustment:
 *     excess is removed from the highest-index asset with room above its min,
 *     deficit is added to the lowest-index asset with room below its max.
 *     (Index 0 is the safe asset, so deficits flow into safety first.)
 *
 * Feasibility (Σmin ≤ 10000 ≤ Σmax) is enforced by the vault constructor, so
 * repair always terminates; a defensive error covers malformed inputs.
 */
export function clamp(targetBps: number[], bounds: MandateBounds): ClampResult {
  const n = targetBps.length
  if (bounds.minBps.length !== n || bounds.maxBps.length !== n) {
    throw new Error(`length mismatch: target ${n}, bounds ${bounds.minBps.length}/${bounds.maxBps.length}`)
  }
  for (let i = 0; i < n; i++) {
    const t = targetBps[i]!
    if (!Number.isInteger(t) || t < 0 || t > TOTAL) {
      throw new Error(`targetBps[${i}] out of range: ${t}`)
    }
  }

  const violations: ClampViolation[] = []
  const clamped = targetBps.map((t, i) => {
    const min = bounds.minBps[i]!
    const max = bounds.maxBps[i]!
    const c = Math.min(Math.max(t, min), max)
    if (c !== t) violations.push({ index: i, target: t, min, max })
    return c
  })

  let sum = clamped.reduce((a, b) => a + b, 0)

  // deficit: add from the LOWEST index with headroom (safety-first)
  let guard = 0
  while (sum < TOTAL) {
    let moved = false
    for (let i = 0; i < n && sum < TOTAL; i++) {
      const room = bounds.maxBps[i]! - clamped[i]!
      if (room > 0) {
        const add = Math.min(room, TOTAL - sum)
        clamped[i]! += add
        sum += add
        moved = true
      }
    }
    if (!moved || ++guard > n + 1) throw new Error('infeasible bounds: cannot reach 10000 (deficit)')
  }
  // excess: remove from the HIGHEST index with room above min (risk-last-in-first-out)
  guard = 0
  while (sum > TOTAL) {
    let moved = false
    for (let i = n - 1; i >= 0 && sum > TOTAL; i--) {
      const room = clamped[i]! - bounds.minBps[i]!
      if (room > 0) {
        const sub = Math.min(room, sum - TOTAL)
        clamped[i]! -= sub
        sum -= sub
        moved = true
      }
    }
    if (!moved || ++guard > n + 1) throw new Error('infeasible bounds: cannot reach 10000 (excess)')
  }

  const unchanged = violations.length === 0 && clamped.every((c, i) => c === targetBps[i])
  return { clampedBps: clamped, violations, unchanged }
}

/**
 * Deterministic safe fallback used when the LLM is unreachable or emits
 * unparseable output: hold the current allocation, clamped into bounds.
 */
export function fallbackAllocation(currentBps: number[], bounds: MandateBounds): number[] {
  return clamp(currentBps, bounds).clampedBps
}
