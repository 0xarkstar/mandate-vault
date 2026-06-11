/**
 * Pure replay-verification core (AC-10).
 *
 * Browser-safe by construction: imports ONLY @mandate-vault/clamp-core (no viem,
 * no node builtins) so the web component can reuse `doVerify` directly.
 */
import {
  clamp,
  hashString,
  ProposalSchema,
  SnapshotSchema,
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
}

export interface ClampReplay {
  /** False when the raw proposal could not be parsed/clamped at all. */
  readonly performed: boolean
  readonly ok: boolean
  readonly expectedBps: readonly number[] | null
  readonly onchainBps: readonly number[]
  readonly reason: string | null
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
 *  2. re-parse snapshot (SnapshotSchema) and raw proposal (ProposalSchema)
 *  3. re-run the deterministic clamp and compare with the on-chain allocation
 */
export function doVerify(
  decisionData: DecisionDataEvent,
  decisionLogged: DecisionLoggedEvent,
  bounds: MandateBounds
): VerifyResult {
  if (decisionData.epoch !== decisionLogged.epoch) {
    throw new Error(
      `epoch mismatch between events: DecisionData ${decisionData.epoch} vs DecisionLogged ${decisionLogged.epoch}`
    )
  }

  const hashChecks: readonly HashCheck[] = [
    hashCheck('snapshot', decisionData.snapshotJson, decisionLogged.inputSnapshotHash),
    hashCheck('proposal', decisionData.rawProposalJson, decisionLogged.rawProposalHash),
    hashCheck('rationale', decisionData.rationale, decisionLogged.rationaleHash)
  ]

  // snapshot: parse for structural sanity (hash equality is the integrity check)
  const snapshot = checkSchema(decisionData.snapshotJson, SnapshotSchema)
  // proposal: must parse — its targetAllocBps feeds the clamp replay
  const proposal = checkSchema(decisionData.rawProposalJson, ProposalSchema)

  const onchainBps = decisionLogged.clampedAllocBps
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

  const verified =
    hashChecks.every((h) => h.ok) && snapshot.check.ok && proposal.check.ok && clampReplay.ok

  return {
    epoch: decisionData.epoch.toString(),
    hashChecks,
    snapshotParse: snapshot.check,
    proposalParse: proposal.check,
    regime: proposal.data?.regime ?? null,
    clampReplay,
    verified
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
