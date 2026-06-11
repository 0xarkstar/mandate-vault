import { clamp, hashString, ProposalSchema } from '@mandate-vault/clamp-core'
import type { Decision, Mandate } from './types'

export interface VerifyCheck {
  label: string
  ok: boolean
  detail: string
}

export interface VerifyResult {
  ok: boolean
  checks: VerifyCheck[]
}

/**
 * Re-run the clamp-core pipeline in the browser against the on-chain decision
 * payload and report whether it reproduces. This is the demo's "Verify" button:
 *  1. recompute keccak(snapshotJson)  == inputSnapshotHash
 *  2. recompute keccak(rawProposalJson) == rawProposalHash
 *  3. recompute keccak(rationale)     == rationaleHash
 *  4. re-parse rawProposal + re-run clamp(target, bounds) == clampedAllocBps
 *
 * Pure: takes the decision + mandate bounds and returns a structured result. No
 * chain access — everything needed was emitted on-chain in DecisionData.
 */
export function verifyDecision(decision: Decision, mandate: Pick<Mandate, 'minBps' | 'maxBps'>): VerifyResult {
  const checks: VerifyCheck[] = []

  const snapHash = hashString(decision.snapshotJson)
  checks.push({
    label: 'Input snapshot hash',
    ok: eqHash(snapHash, decision.inputSnapshotHash),
    detail: hashDetail(snapHash, decision.inputSnapshotHash)
  })

  const proposalHash = hashString(decision.rawProposalJson)
  checks.push({
    label: 'Raw proposal hash',
    ok: eqHash(proposalHash, decision.rawProposalHash),
    detail: hashDetail(proposalHash, decision.rawProposalHash)
  })

  const rationaleHash = hashString(decision.rationale)
  checks.push({
    label: 'Rationale hash',
    ok: eqHash(rationaleHash, decision.rationaleHash),
    detail: hashDetail(rationaleHash, decision.rationaleHash)
  })

  // re-run the clamp from the emitted raw proposal and the mandate bounds
  const clampCheck = recomputeClamp(decision, mandate)
  checks.push(clampCheck)

  return { ok: checks.every((c) => c.ok), checks }
}

function recomputeClamp(decision: Decision, mandate: Pick<Mandate, 'minBps' | 'maxBps'>): VerifyCheck {
  const parsed = ProposalSchema.safeParse(safeJson(decision.rawProposalJson))
  if (!parsed.success) {
    return {
      label: 'Clamp recomputation',
      ok: false,
      detail: `raw proposal did not parse: ${parsed.error.issues[0]?.message ?? 'invalid'}`
    }
  }

  const bounds = {
    minBps: [...mandate.minBps],
    maxBps: [...mandate.maxBps]
  }

  try {
    const { clampedBps } = clamp(parsed.data.targetAllocBps, bounds)
    const onChain = [...decision.clampedAllocBps]
    const match = clampedBps.length === onChain.length && clampedBps.every((v, i) => v === onChain[i])
    return {
      label: 'Clamp recomputation',
      ok: match,
      detail: match
        ? `recomputed [${clampedBps.join(', ')}] == on-chain`
        : `recomputed [${clampedBps.join(', ')}] ≠ on-chain [${onChain.join(', ')}]`
    }
  } catch (err) {
    return {
      label: 'Clamp recomputation',
      ok: false,
      detail: err instanceof Error ? err.message : 'clamp threw'
    }
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function eqHash(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

function hashDetail(recomputed: string, onChain: string): string {
  if (eqHash(recomputed, onChain)) return `${short(recomputed)} matches`
  return `recomputed ${short(recomputed)} ≠ on-chain ${short(onChain)}`
}

function short(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}
