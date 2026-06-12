import type { Proposal } from '@mandate-vault/clamp-core'
import type { Verdict, GateOutcome } from './types.js'

/**
 * Deterministic gate: resolve proposer + reviewer to act-or-hold in ONE pass
 * (harness invariant #3 — bounded, no retry loops, default to HOLD: funds
 * untouched). Emits the ExecutionIntent that is the ONLY thing the execution
 * engine accepts.
 */

export interface GateInputs {
  vault: string
  proposal: Proposal
  verdict: Verdict
  maxSlippageBps: number
  playbookVersion: number
  snapshotHash: string
}

export function gateDecision(inputs: GateInputs): GateOutcome {
  const { vault, proposal, verdict, maxSlippageBps, playbookVersion, snapshotHash } = inputs

  if (verdict.verdict !== 'approved') {
    return { action: 'hold', reason: `reviewer hold: ${verdict.reason}` }
  }

  // Structural sanity — anything malformed resolves to HOLD, never to a guess.
  if (proposal.targetAllocBps.length === 0) {
    return { action: 'hold', reason: 'gate hold: empty target allocation' }
  }
  if (proposal.targetAllocBps.some((b) => !Number.isInteger(b) || b < 0 || b > 10_000)) {
    return { action: 'hold', reason: 'gate hold: target allocation out of bps range' }
  }

  return {
    action: 'act',
    intent: {
      vault,
      targetAllocBps: proposal.targetAllocBps,
      maxSlippageBps,
      playbookVersion,
      snapshotHash,
      reviewVerdict: verdict
    }
  }
}
