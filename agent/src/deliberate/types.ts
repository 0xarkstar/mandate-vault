import { z } from 'zod'

/**
 * Typed contracts of the DELIBERATION engine (docs/HARNESS.md). Deliberation
 * decides WHAT (the intent); execution decides HOW (the fill). The two engines
 * talk ONLY through ExecutionIntent.
 */

/** Adversarial reviewer output (different model from the proposer). */
export const VerdictSchema = z.object({
  verdict: z.enum(['approved', 'hold']),
  reason: z.string().min(1).max(2000)
})

export type Verdict = z.infer<typeof VerdictSchema>

/** deliberation → execution. The ONLY payload execution accepts. */
export interface ExecutionIntent {
  vault: string
  targetAllocBps: number[]
  maxSlippageBps: number
  playbookVersion: number
  snapshotHash: string
  reviewVerdict: Verdict
}

export type GateOutcome =
  | { action: 'act'; intent: ExecutionIntent }
  | { action: 'hold'; reason: string }
