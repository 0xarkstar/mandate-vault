import { describe, expect, it } from 'vitest'
import { canonicalJson, decryptEnvelope, parseEnvelope } from '@mandate-vault/clamp-core'
import { buildConfidentialPayloads } from '../src/confidential.js'

const KEY = 'a'.repeat(64)

const snapshotJson = canonicalJson({
  ts: 1_770_000_000,
  chainId: 5003,
  vault: '0x1111111111111111111111111111111111111111',
  llmFallback: false,
  playbookVersion: 2
})
const rawProposalJson = canonicalJson({
  regime: 'RISK_ON',
  targetAllocBps: [3000, 7000],
  rationale: 'carry attractive'
})
const rationale = 'carry attractive'

describe('buildConfidentialPayloads', () => {
  it('round-trips: decrypt returns the original canonical strings', async () => {
    const published = await buildConfidentialPayloads({
      snapshotJson,
      rawProposalJson,
      rationale,
      viewingKey: KEY,
      publicFields: { playbookVersion: 2 }
    })

    const snapEnv = parseEnvelope(published.snapshotJson)
    const proposalEnv = parseEnvelope(published.rawProposalJson)
    const rationaleEnv = parseEnvelope(published.rationale)
    expect(snapEnv).not.toBeNull()
    expect(proposalEnv).not.toBeNull()
    expect(rationaleEnv).not.toBeNull()

    expect(await decryptEnvelope(snapEnv!, KEY)).toBe(snapshotJson)
    expect(await decryptEnvelope(proposalEnv!, KEY)).toBe(rawProposalJson)
    expect(await decryptEnvelope(rationaleEnv!, KEY)).toBe(rationale)
  })

  it('keeps public fields visible as plaintext siblings in the published snapshot', async () => {
    const published = await buildConfidentialPayloads({
      snapshotJson,
      rawProposalJson,
      rationale,
      viewingKey: KEY,
      publicFields: { llmFallback: true, playbookVersion: 5 }
    })
    const parsed = parseEnvelope(published.snapshotJson)
    expect(parsed?.llmFallback).toBe(true)
    expect(parsed?.playbookVersion).toBe(5)
    // the proposal/rationale envelopes carry no public siblings
    const proposal = parseEnvelope(published.rawProposalJson)
    expect(proposal?.llmFallback).toBeUndefined()
    expect(proposal?.playbookVersion).toBeUndefined()
  })

  it('omits playbookVersion 0 but exposes playbookVersion 2 (matches plaintext v0 rule)', async () => {
    const v0 = await buildConfidentialPayloads({
      snapshotJson,
      rawProposalJson,
      rationale,
      viewingKey: KEY,
      publicFields: { playbookVersion: 0 }
    })
    const parsedV0 = parseEnvelope(v0.snapshotJson) as Record<string, unknown>
    expect('playbookVersion' in parsedV0).toBe(false)
    // the encrypted inner content (canonical snapshot string) is unaffected
    expect(await decryptEnvelope(parseEnvelope(v0.snapshotJson)!, KEY)).toBe(snapshotJson)

    const v2 = await buildConfidentialPayloads({
      snapshotJson,
      rawProposalJson,
      rationale,
      viewingKey: KEY,
      publicFields: { playbookVersion: 2 }
    })
    expect(parseEnvelope(v2.snapshotJson)?.playbookVersion).toBe(2)
  })

  it('omits absent public fields (no llmFallback / playbookVersion keys)', async () => {
    const published = await buildConfidentialPayloads({
      snapshotJson,
      rawProposalJson,
      rationale,
      viewingKey: KEY,
      publicFields: {}
    })
    const parsed = parseEnvelope(published.snapshotJson) as Record<string, unknown>
    expect('llmFallback' in parsed).toBe(false)
    expect('playbookVersion' in parsed).toBe(false)
  })
})
