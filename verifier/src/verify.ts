/**
 * Pure replay-verification core (AC-10).
 *
 * Browser-safe by construction: imports ONLY @mandate-vault/clamp-core (no viem,
 * no node builtins) so the web component can reuse `doVerify` directly.
 */
import {
  clamp,
  decryptEnvelope,
  hashString,
  parseEnvelope,
  ProposalSchema,
  SnapshotSchema,
  type ConfidentialEnvelope,
  type MandateBounds
} from '@mandate-vault/clamp-core'

// ----------------------------------------------------------------- event types

/** Decoded `DecisionData(uint64 indexed epoch, string, string, string)` payload. */
export interface DecisionDataEvent {
  readonly epoch: bigint
  readonly snapshotJson: string
  readonly rawProposalJson: string
  readonly rationale: string
}

/** Decoded `DecisionLogged(uint64 indexed epoch, bytes32, bytes32, uint16[], bytes32)` payload. */
export interface DecisionLoggedEvent {
  readonly epoch: bigint
  readonly inputSnapshotHash: string
  readonly rawProposalHash: string
  readonly clampedAllocBps: readonly number[]
  readonly rationaleHash: string
}

// ---------------------------------------------------------------- result types

export interface HashCheck {
  readonly label: 'snapshot' | 'proposal' | 'rationale'
  readonly recomputed: string
  readonly onchain: string
  readonly ok: boolean
}

export interface ParseCheck {
  readonly ok: boolean
  readonly error: string | null
  /** True when the payload is an encrypted envelope and no viewing key was
   * supplied — the schema/clamp content check is locked, not failed. */
  readonly locked?: boolean
}

export interface ClampReplay {
  /** False when the raw proposal could not be parsed/clamped at all. */
  readonly performed: boolean
  readonly ok: boolean
  readonly expectedBps: readonly number[] | null
  readonly onchainBps: readonly number[]
  readonly reason: string | null
  /** True when the proposal is an encrypted envelope and no key was supplied. */
  readonly locked?: boolean
}

export interface VerifyResult {
  readonly epoch: string
  readonly hashChecks: readonly HashCheck[]
  readonly snapshotParse: ParseCheck
  readonly proposalParse: ParseCheck
  /** Regime claimed by the parsed proposal, null when unparseable. */
  readonly regime: string | null
  readonly clampReplay: ClampReplay
  readonly verified: boolean
  /** True when all three keccak hash checks pass (payload integrity). Independent
   * of bounds — sound even if the owner changed mandate() after this epoch. */
  readonly integrityOk: boolean
  /** True exactly when the plaintext payload integrity-checks and schema-parses but
   * the recomputed clamp differs (the only divergence). Almost certainly a
   * post-epoch mandate-bounds change, NOT tampering — render reports INDETERMINATE. */
  readonly indeterminate: boolean
  /** True when the on-chain payloads are encrypted envelopes (privacy-lite). */
  readonly confidential: boolean
  /** True when the inner content (schema + clamp) was actually re-verified.
   * False when confidential and locked (no viewing key) — integrity only. */
  readonly contentVerified: boolean
}

// -------------------------------------------------------------------- helpers

type JsonResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string }

function tryParseJson(raw: string): JsonResult {
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
}

interface ZodErrorLike {
  readonly issues: readonly { readonly path: readonly (string | number)[]; readonly message: string }[]
}

function zodIssueSummary(error: ZodErrorLike): string {
  return error.issues
    .map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ')
}

interface SchemaLike<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: ZodErrorLike }
}

interface SchemaResult<T> {
  readonly check: ParseCheck
  readonly data: T | null
}

/** JSON.parse + zod-validate an emitted payload string. */
function checkSchema<T>(raw: string, schema: SchemaLike<T>): SchemaResult<T> {
  const json = tryParseJson(raw)
  if (!json.ok) return { check: { ok: false, error: json.error }, data: null }
  const result = schema.safeParse(json.value)
  if (!result.success) {
    return { check: { ok: false, error: zodIssueSummary(result.error) }, data: null }
  }
  return { check: { ok: true, error: null }, data: result.data }
}

function hashCheck(label: HashCheck['label'], payload: string, onchain: string): HashCheck {
  const recomputed = hashString(payload)
  return { label, recomputed, onchain, ok: recomputed.toLowerCase() === onchain.toLowerCase() }
}

// --------------------------------------------------------------------- tamper

export interface TamperResult {
  readonly tampered: string
  readonly index: number
  readonly from: string
  readonly to: string
}

/**
 * Deterministically mutate ONE character of a string (demo of tamper detection).
 * The first digit is flipped ('9' → '8', otherwise d+1) so that JSON payloads
 * stay valid JSON — the hash check, not a parse error, is what must catch it.
 */
export function tamperString(s: string): TamperResult {
  const index = s.search(/[0-9]/)
  if (index === -1) {
    // no digit anywhere — append a space (still a 1-char mutation)
    return { tampered: `${s} `, index: s.length, from: '', to: ' ' }
  }
  const from = s.charAt(index)
  const to = from === '9' ? '8' : String(Number(from) + 1)
  return { tampered: `${s.slice(0, index)}${to}${s.slice(index + 1)}`, index, from, to }
}

// --------------------------------------------------------------------- verify

/**
 * Replay one on-chain decision from its emitted payload:
 *  1. recompute keccak256 of snapshot/proposal/rationale vs DecisionLogged hashes
 *     (ALWAYS on the published strings — integrity, unchanged for envelopes)
 *  2. re-parse snapshot (SnapshotSchema) and raw proposal (ProposalSchema)
 *  3. re-run the deterministic clamp and compare with the on-chain allocation
 *
 * Privacy-lite: when the published snapshot is an encrypted envelope, steps 2–3
 * operate on the DECRYPTED inner strings (requires `viewingKey`). Without a key,
 * integrity (hashes) still verifies but content checks report `locked`. A wrong
 * key produces a clean failure.
 */
export async function doVerify(
  decisionData: DecisionDataEvent,
  decisionLogged: DecisionLoggedEvent,
  bounds: MandateBounds,
  viewingKey?: string
): Promise<VerifyResult> {
  if (decisionData.epoch !== decisionLogged.epoch) {
    throw new Error(
      `epoch mismatch between events: DecisionData ${decisionData.epoch} vs DecisionLogged ${decisionLogged.epoch}`
    )
  }

  // Hash checks ALWAYS run on the published strings (integrity is independent of
  // whether the content is confidential).
  const hashChecks: readonly HashCheck[] = [
    hashCheck('snapshot', decisionData.snapshotJson, decisionLogged.inputSnapshotHash),
    hashCheck('proposal', decisionData.rawProposalJson, decisionLogged.rawProposalHash),
    hashCheck('rationale', decisionData.rationale, decisionLogged.rationaleHash)
  ]

  const snapEnvelope = parseEnvelope(decisionData.snapshotJson)
  const confidential = snapEnvelope !== null

  // Resolve the inner (plaintext) snapshot/proposal strings to content-check.
  const inner = await resolveInner(decisionData, snapEnvelope, viewingKey)
  const onchainBps = decisionLogged.clampedAllocBps

  if (inner.kind === 'locked') {
    // Envelope + no key: integrity-only. Content rows are LOCKED, not failed.
    const lockedParse: ParseCheck = { ok: false, error: null, locked: true }
    const hashesOk = hashChecks.every((h) => h.ok)
    return {
      epoch: decisionData.epoch.toString(),
      hashChecks,
      snapshotParse: lockedParse,
      proposalParse: lockedParse,
      regime: null,
      clampReplay: {
        performed: false,
        ok: false,
        expectedBps: null,
        onchainBps,
        reason: 'content confidential — supply --viewing-key to replay schema + clamp',
        locked: true
      },
      verified: hashesOk,
      integrityOk: hashesOk,
      indeterminate: false,
      confidential: true,
      contentVerified: false
    }
  }

  if (inner.kind === 'wrong-key') {
    // Envelope + wrong key (or tampered ciphertext): clean failure.
    const failParse: ParseCheck = { ok: false, error: 'viewing key incorrect or data tampered' }
    return {
      epoch: decisionData.epoch.toString(),
      hashChecks,
      snapshotParse: failParse,
      proposalParse: failParse,
      regime: null,
      clampReplay: {
        performed: false,
        ok: false,
        expectedBps: null,
        onchainBps,
        reason: 'viewing key incorrect or data tampered'
      },
      verified: false,
      integrityOk: hashChecks.every((h) => h.ok),
      indeterminate: false,
      confidential: true,
      contentVerified: false
    }
  }

  // Plaintext, or envelope decrypted with the correct key: run the content checks
  // on the inner strings.
  const snapshot = checkSchema(inner.snapshotJson, SnapshotSchema)
  const proposal = checkSchema(inner.rawProposalJson, ProposalSchema)

  const clampReplay: ClampReplay =
    proposal.data === null
      ? {
          performed: false,
          ok: false,
          expectedBps: null,
          onchainBps,
          reason: 'raw proposal failed schema validation — clamp replay skipped'
        }
      : replayClamp(proposal.data.targetAllocBps, bounds, onchainBps)

  const contentOk = snapshot.check.ok && proposal.check.ok && clampReplay.ok
  const integrityOk = hashChecks.every((h) => h.ok)
  const verified = integrityOk && contentOk

  // Bounds-drift vs tamper: hashes intact and both schemas parsed, with the clamp
  // as the SOLE divergence → almost certainly a post-epoch setMandateBounds, not a
  // forged decision. Confidential payloads are never indeterminate.
  const indeterminate =
    !confidential &&
    integrityOk &&
    snapshot.check.ok &&
    proposal.check.ok &&
    clampReplay.performed &&
    !clampReplay.ok

  return {
    epoch: decisionData.epoch.toString(),
    hashChecks,
    snapshotParse: snapshot.check,
    proposalParse: proposal.check,
    regime: proposal.data?.regime ?? null,
    clampReplay,
    verified,
    integrityOk,
    indeterminate,
    confidential,
    contentVerified: contentOk
  }
}

type InnerResult =
  | { readonly kind: 'plain'; readonly snapshotJson: string; readonly rawProposalJson: string }
  | { readonly kind: 'locked' }
  | { readonly kind: 'wrong-key' }

/**
 * Resolve the strings the schema/clamp checks run against:
 *  - plaintext payloads → return them as-is
 *  - envelope + no key → `locked`
 *  - envelope + key → decrypt all three; failure → `wrong-key`
 */
async function resolveInner(
  decisionData: DecisionDataEvent,
  snapEnvelope: ConfidentialEnvelope | null,
  viewingKey: string | undefined
): Promise<InnerResult> {
  if (snapEnvelope === null) {
    return { kind: 'plain', snapshotJson: decisionData.snapshotJson, rawProposalJson: decisionData.rawProposalJson }
  }
  if (!viewingKey) return { kind: 'locked' }

  const proposalEnvelope = parseEnvelope(decisionData.rawProposalJson)
  if (proposalEnvelope === null) return { kind: 'wrong-key' }
  try {
    const [snapshotJson, rawProposalJson] = await Promise.all([
      decryptEnvelope(snapEnvelope, viewingKey),
      decryptEnvelope(proposalEnvelope, viewingKey)
    ])
    return { kind: 'plain', snapshotJson, rawProposalJson }
  } catch {
    return { kind: 'wrong-key' }
  }
}

function replayClamp(
  targetBps: readonly number[],
  bounds: MandateBounds,
  onchainBps: readonly number[]
): ClampReplay {
  try {
    const { clampedBps } = clamp([...targetBps], bounds)
    const ok =
      clampedBps.length === onchainBps.length && clampedBps.every((b, i) => b === onchainBps[i])
    return {
      performed: true,
      ok,
      expectedBps: clampedBps,
      onchainBps,
      reason: ok ? null : 'recomputed clamp differs from on-chain allocation'
    }
  } catch (err) {
    return {
      performed: false,
      ok: false,
      expectedBps: null,
      onchainBps,
      reason: `clamp replay failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}
