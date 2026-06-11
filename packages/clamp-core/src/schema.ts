import { z } from 'zod'

/**
 * The LLM's structured output. The model is free to propose anything inside
 * this shape — the clamp (and the on-chain re-check) is what cages it.
 */
export const ProposalSchema = z.object({
  regime: z.enum(['RISK_ON', 'NEUTRAL', 'RISK_OFF']),
  targetAllocBps: z.array(z.number().int().min(0).max(10_000)).min(1).max(8),
  rationale: z.string().min(1).max(4000)
})

export type Proposal = z.infer<typeof ProposalSchema>

/** Mandate bounds as known off-chain (mirrors the on-chain Mandate struct). */
export const MandateBoundsSchema = z.object({
  minBps: z.array(z.number().int().min(0).max(10_000)),
  maxBps: z.array(z.number().int().min(0).max(10_000))
})

export type MandateBounds = z.infer<typeof MandateBoundsSchema>

/** Input snapshot recorded on-chain alongside every decision. */
export const SnapshotSchema = z
  .object({
    ts: z.number().int(),
    chainId: z.number().int(),
    vault: z.string(),
    funding: z.object({
      lastRate: z.string(),
      mean7d: z.string(),
      markPrice: z.string()
    }),
    prices: z.record(z.string(), z.string()),
    vaultState: z.object({
      allocBps: z.array(z.number().int()),
      sharePrice: z.string(),
      hwm: z.string(),
      tripped: z.boolean()
    }),
    llmFallback: z.boolean().optional()
  })
  .passthrough()

export type Snapshot = z.infer<typeof SnapshotSchema>
