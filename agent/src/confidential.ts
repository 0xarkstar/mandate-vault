import { canonicalJson, encryptString } from '@mandate-vault/clamp-core'

/**
 * Privacy-lite: turn the three plaintext decision payloads into the strings the
 * agent actually publishes on-chain when a viewing key is set.
 *
 * The encrypted plaintexts are the ORIGINAL canonical strings, so a holder of
 * the viewing key decrypts back to byte-identical payloads and the existing
 * schema-parse + clamp-replay verification runs unchanged. Outsiders see only:
 *  - snapshot: the encrypted envelope PLUS plaintext `publicFields` siblings
 *    (`llmFallback`, `playbookVersion`) — "a real LLM ran" / "playbook vN" stay
 *    visible without leaking contents.
 *  - rawProposal / rationale: the encrypted envelope alone.
 *
 * Hashes commit to these published strings, so integrity verification is
 * identical to the plaintext path.
 */

export interface ConfidentialPublicFields {
  /** Mirrors the snapshot's `llmFallback` — visible even when encrypted. */
  llmFallback?: true
  /** Mirrors the snapshot's `playbookVersion` — visible even when encrypted. */
  playbookVersion?: number
}

export interface ConfidentialInput {
  snapshotJson: string
  rawProposalJson: string
  rationale: string
  viewingKey: string
  publicFields: ConfidentialPublicFields
}

export interface ConfidentialPayloads {
  snapshotJson: string
  rawProposalJson: string
  rationale: string
}

/** Drop undefined entries so `canonicalJson` output stays minimal and stable. */
function compactPublicFields(fields: ConfidentialPublicFields): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (fields.llmFallback === true) out.llmFallback = true
  // Match the plaintext snapshot rule (snapshot.ts): expose playbookVersion only
  // when > 0, so v0/pre-learning omits the sibling on the confidential path too.
  if (typeof fields.playbookVersion === 'number' && fields.playbookVersion > 0) {
    out.playbookVersion = fields.playbookVersion
  }
  return out
}

export async function buildConfidentialPayloads(input: ConfidentialInput): Promise<ConfidentialPayloads> {
  const { snapshotJson, rawProposalJson, rationale, viewingKey, publicFields } = input
  const [snapEnv, proposalEnv, rationaleEnv] = await Promise.all([
    encryptString(snapshotJson, viewingKey),
    encryptString(rawProposalJson, viewingKey),
    encryptString(rationale, viewingKey)
  ])
  return {
    snapshotJson: canonicalJson({ ...snapEnv, ...compactPublicFields(publicFields) }),
    rawProposalJson: canonicalJson(proposalEnv),
    rationale: canonicalJson(rationaleEnv)
  }
}
