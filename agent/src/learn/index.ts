import { z } from 'zod'
import type { DecisionRecord, RegimeStats } from './distill.js'
import { distillDecisions } from './distill.js'

/**
 * PolicyIndex compilation — the MEMORY.md-index pattern applied to the agent:
 * the hot path never reads raw history, only this small flat lookup. The
 * learning engine recompiles it in the background; deliberation snapshots the
 * version it read (playbookVersion) so every decision replays against the
 * policy it actually used.
 */

export const PolicyIndexSchema = z.object({
  version: z.number().int().nonnegative(),
  updatedAtBlock: z.string(),
  regimeHints: z.record(
    z.string(),
    z.object({
      decisions: z.number().int(),
      cageHitRate: z.number(),
      fallbackRate: z.number(),
      avgImprovementBps: z.number(),
      worstImprovementBps: z.number(),
      hint: z.string()
    })
  )
})

export type PolicyIndex = z.infer<typeof PolicyIndexSchema>

function hintFor(regime: string, s: RegimeStats): string {
  const parts: string[] = []
  if (s.decisions > 0 && s.cageHits / s.decisions > 0.3) {
    parts.push('frequent cage hits — propose nearer the mandate interior')
  }
  if (s.fills > 0 && s.avgImprovementBps < 0) {
    parts.push('fills averaging worse than mid — tighten the slippage gate')
  }
  if (s.fills > 0 && s.avgImprovementBps >= 0) {
    parts.push('RFQ fills at-or-better than mid — keep routing through quotes')
  }
  if (parts.length === 0) parts.push('no corrective signal — defaults hold')
  return `${regime}: ${parts.join('; ')}`
}

/** Compile decision records into PolicyIndex v(prev+1). Pure. */
export function compilePolicyIndex(records: DecisionRecord[], previousVersion: number): PolicyIndex {
  const stats = distillDecisions(records)
  const regimeHints: PolicyIndex['regimeHints'] = {}
  for (const [regime, s] of Object.entries(stats)) {
    regimeHints[regime] = {
      decisions: s.decisions,
      cageHitRate: s.decisions === 0 ? 0 : Math.round((s.cageHits / s.decisions) * 1000) / 1000,
      fallbackRate: s.decisions === 0 ? 0 : Math.round((s.fallbacks / s.decisions) * 1000) / 1000,
      avgImprovementBps: s.avgImprovementBps,
      worstImprovementBps: s.worstImprovementBps,
      hint: hintFor(regime, s)
    }
  }
  const maxBlock = records.reduce((m, r) => (r.blockNumber > m ? r.blockNumber : m), 0n)
  return {
    version: previousVersion + 1,
    updatedAtBlock: maxBlock.toString(),
    regimeHints
  }
}
