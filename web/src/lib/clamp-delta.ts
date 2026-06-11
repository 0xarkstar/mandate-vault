/**
 * Compute the per-asset difference between a raw LLM proposal and the clamped
 * on-chain allocation. Used to highlight where the mandate cage actually bit.
 */

export interface ClampDeltaRow {
  index: number
  raw: number
  clamped: number
  delta: number
  changed: boolean
}

export interface ClampDelta {
  rows: ClampDeltaRow[]
  /** True when at least one asset was moved by the clamp. */
  anyChanged: boolean
}

/**
 * Pair raw proposal bps against clamped bps. Lengths may differ if the raw
 * proposal is malformed; missing entries are treated as 0 so the UI degrades
 * gracefully rather than throwing.
 */
export function computeClampDelta(rawBps: readonly number[], clampedBps: readonly number[]): ClampDelta {
  const n = Math.max(rawBps.length, clampedBps.length)
  const rows: ClampDeltaRow[] = []
  for (let i = 0; i < n; i++) {
    const raw = rawBps[i] ?? 0
    const clamped = clampedBps[i] ?? 0
    const delta = clamped - raw
    rows.push({ index: i, raw, clamped, delta, changed: delta !== 0 })
  }
  return { rows, anyChanged: rows.some((r) => r.changed) }
}

/**
 * Parse a `targetAllocBps` array out of a raw proposal JSON string. Returns an
 * empty array if the JSON is unparseable or the field is missing/ill-typed —
 * the caller decides how to present "no parseable proposal".
 */
export function extractTargetBps(rawProposalJson: string): number[] {
  try {
    const parsed: unknown = JSON.parse(rawProposalJson)
    if (parsed !== null && typeof parsed === 'object' && 'targetAllocBps' in parsed) {
      const arr = (parsed as { targetAllocBps: unknown }).targetAllocBps
      if (Array.isArray(arr) && arr.every((x) => typeof x === 'number')) {
        return arr as number[]
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

/**
 * Parse the `regime` field out of a raw proposal JSON string. Returns null when
 * absent or not one of the known regimes.
 */
export function extractRegime(rawProposalJson: string): 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | null {
  try {
    const parsed: unknown = JSON.parse(rawProposalJson)
    if (parsed !== null && typeof parsed === 'object' && 'regime' in parsed) {
      const r = (parsed as { regime: unknown }).regime
      if (r === 'RISK_ON' || r === 'NEUTRAL' || r === 'RISK_OFF') return r
    }
  } catch {
    /* ignore */
  }
  return null
}
