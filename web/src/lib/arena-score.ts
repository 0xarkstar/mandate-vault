/**
 * Agent Arena scoring — execution quality from on-chain behaviour, NOT alpha or
 * returns. We never score "was the allocation good?"; we score "did the AI move
 * capital well and stay inside its mandate?". Every input is observable on-chain.
 *
 * score = 50·norm(avgImprovementBps) + 30·(1 − cageHitRate) + 20·(1 − fallbackRate)
 *
 * clamped to [0, 100]. Weights are deliberate and documented:
 *  - 50  execution quality: average fill-vs-mid improvement (the headline metric)
 *  - 30  mandate fit: cage-hit rate (lower is better — fewer proposals needed
 *        clamping back inside the bounds; a proxy for on-chain compliance since
 *        out-of-bounds rebalances revert and never land)
 *  - 20  autonomy: LLM-fallback rate (lower is better — the agent rarely had to
 *        drop to its deterministic hold path)
 */

/** Bps improvement that maps to a full execution score. */
export const IMPROVEMENT_NORM_BPS = 20

export interface ArenaInputs {
  /** Mean fill-vs-mid improvement across the vault's RFQ fills, in bps. */
  avgImprovementBps: number
  /** Fraction (0–1) of decisions whose proposal was clamped. */
  cageHitRate: number
  /** Fraction (0–1) of decisions that used the deterministic LLM fallback. */
  fallbackRate: number
}

export interface ArenaScore {
  score: number
  execution: number
  mandateFit: number
  autonomy: number
}

/**
 * Compute a 0–100 execution-quality score from on-chain behaviour. Improvement
 * is normalised against {@link IMPROVEMENT_NORM_BPS} and clamped to [0, 1];
 * negative improvement (worse than oracle mid) contributes zero to that term.
 */
export function arenaScore(inputs: ArenaInputs): ArenaScore {
  const improvementNorm = clamp01(inputs.avgImprovementBps / IMPROVEMENT_NORM_BPS)
  const cageHit = clamp01(inputs.cageHitRate)
  const fallback = clamp01(inputs.fallbackRate)

  const execution = 50 * improvementNorm
  const mandateFit = 30 * (1 - cageHit)
  const autonomy = 20 * (1 - fallback)
  const score = clamp(execution + mandateFit + autonomy, 0, 100)

  return {
    score: round1(score),
    execution: round1(execution),
    mandateFit: round1(mandateFit),
    autonomy: round1(autonomy)
  }
}

function clamp01(n: number): number {
  return clamp(n, 0, 1)
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
