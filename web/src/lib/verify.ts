import {
  clamp,
  decryptEnvelope,
  hashString,
  parseEnvelope,
  ProposalSchema
} from '@mandate-vault/clamp-core'
import type { Decision, Mandate } from './types'

export interface VerifyCheck {
  label: string
  ok: boolean
  detail: string
  /** True when the check is locked behind a confidential envelope (no key). */
  locked?: boolean
}

export interface VerifyResult {
  ok: boolean
  checks: VerifyCheck[]
  /** True when the on-chain payloads are encrypted envelopes (privacy-lite). */
  confidential?: boolean
  /** True when the inner content was actually re-verified (decrypted + clamped). */
  contentVerified?: boolean
}

/** Is this decision's snapshot an encrypted (privacy-lite) envelope? */
export function isConfidentialDecision(decision: Pick<Decision, 'snapshotJson'>): boolean {
  return parseEnvelope(decision.snapshotJson) !== null
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

/** The three keccak integrity checks, computed on the PUBLISHED strings. */
function hashChecks(decision: Decision): VerifyCheck[] {
  const snapHash = hashString(decision.snapshotJson)
  const proposalHash = hashString(decision.rawProposalJson)
  const rationaleHash = hashString(decision.rationale)
  return [
    {
      label: 'Input snapshot hash',
      ok: eqHash(snapHash, decision.inputSnapshotHash),
      detail: hashDetail(snapHash, decision.inputSnapshotHash)
    },
    {
      label: 'Raw proposal hash',
      ok: eqHash(proposalHash, decision.rawProposalHash),
      detail: hashDetail(proposalHash, decision.rawProposalHash)
    },
    {
      label: 'Rationale hash',
      ok: eqHash(rationaleHash, decision.rationaleHash),
      detail: hashDetail(rationaleHash, decision.rationaleHash)
    }
  ]
}

/**
 * Confidential-aware verification (privacy-lite). Hash checks always run on the
 * published strings (integrity). When the snapshot is an encrypted envelope and
 * a viewing key is supplied, the proposal envelope is decrypted and the clamp is
 * replayed on the inner plaintext. Without a key, content checks are LOCKED but
 * integrity still verifies. A wrong key fails cleanly.
 *
 * For non-confidential decisions this matches {@link verifyDecision}.
 */
export async function verifyDecisionConfidential(
  decision: Decision,
  mandate: Pick<Mandate, 'minBps' | 'maxBps'>,
  viewingKey?: string
): Promise<VerifyResult> {
  const checks = hashChecks(decision)
  const snapEnvelope = parseEnvelope(decision.snapshotJson)

  if (snapEnvelope === null) {
    // Plaintext path — identical to verifyDecision.
    checks.push(recomputeClamp(decision, mandate))
    return { ok: checks.every((c) => c.ok), checks, confidential: false, contentVerified: true }
  }

  if (!viewingKey) {
    checks.push({
      label: 'Clamp recomputation',
      ok: false,
      locked: true,
      detail: 'content confidential — enter the viewing key to replay'
    })
    return {
      ok: checks.every((c) => c.ok || c.locked),
      checks,
      confidential: true,
      contentVerified: false
    }
  }

  const proposalEnvelope = parseEnvelope(decision.rawProposalJson)
  let innerProposalJson: string
  try {
    if (proposalEnvelope === null) throw new Error('proposal not an envelope')
    innerProposalJson = await decryptEnvelope(proposalEnvelope, viewingKey)
    await decryptEnvelope(snapEnvelope, viewingKey)
  } catch {
    checks.push({
      label: 'Clamp recomputation',
      ok: false,
      detail: 'viewing key incorrect or data tampered'
    })
    return { ok: false, checks, confidential: true, contentVerified: false }
  }

  checks.push(recomputeClampFromJson(innerProposalJson, decision.clampedAllocBps, mandate))
  const contentVerified = checks.every((c) => c.ok)
  return { ok: contentVerified, checks, confidential: true, contentVerified }
}

function recomputeClamp(decision: Decision, mandate: Pick<Mandate, 'minBps' | 'maxBps'>): VerifyCheck {
  return recomputeClampFromJson(decision.rawProposalJson, decision.clampedAllocBps, mandate)
}

/** Re-parse a (possibly decrypted) raw-proposal JSON and replay the clamp. */
function recomputeClampFromJson(
  rawProposalJson: string,
  clampedAllocBps: readonly number[],
  mandate: Pick<Mandate, 'minBps' | 'maxBps'>
): VerifyCheck {
  const parsed = ProposalSchema.safeParse(safeJson(rawProposalJson))
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
    const onChain = [...clampedAllocBps]
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
