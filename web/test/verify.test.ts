import { describe, it, expect } from 'vitest'
import { clamp, hashString } from '@mandate-vault/clamp-core'
import { verifyDecision } from '../src/lib/verify'
import type { Decision } from '../src/lib/types'

const bounds = { minBps: [3000, 0], maxBps: [10_000, 7000] }

function buildDecision(overrides: Partial<Decision> = {}): Decision {
  const snapshotJson = '{"chainId":5003,"ts":1700000000,"vault":"0xabc"}'
  // raw proposes 100% into the risk asset; clamp pulls it to [3000,7000]
  const rawProposalJson = '{"regime":"RISK_ON","targetAllocBps":[0,10000],"rationale":"max carry"}'
  const rationale = 'max carry'
  const { clampedBps } = clamp([0, 10_000], bounds)

  return {
    epoch: 1,
    txHash: '0xdeadbeef' as `0x${string}`,
    blockNumber: 100n,
    timestamp: 1700000000,
    inputSnapshotHash: hashString(snapshotJson),
    rawProposalHash: hashString(rawProposalJson),
    rationaleHash: hashString(rationale),
    clampedAllocBps: clampedBps,
    snapshotJson,
    rawProposalJson,
    rationale,
    ...overrides
  }
}

describe('verifyDecision', () => {
  it('verifies a faithfully recorded decision (all checks pass)', () => {
    const result = verifyDecision(buildDecision(), bounds)
    expect(result.ok).toBe(true)
    expect(result.checks).toHaveLength(4)
    expect(result.checks.every((c) => c.ok)).toBe(true)
  })

  it('reproduces the clamp: [0,10000] → [3000,7000]', () => {
    const d = buildDecision()
    const clampCheck = verifyDecision(d, bounds).checks.find((c) => c.label === 'Clamp recomputation')
    expect(clampCheck?.ok).toBe(true)
    expect(d.clampedAllocBps).toEqual([3000, 7000])
  })

  it('detects a tampered snapshot (hash mismatch → ✗)', () => {
    const d = buildDecision({ snapshotJson: '{"chainId":5003,"ts":1700000001,"vault":"0xabc"}' })
    const result = verifyDecision(d, bounds)
    expect(result.ok).toBe(false)
    const snapCheck = result.checks.find((c) => c.label === 'Input snapshot hash')
    expect(snapCheck?.ok).toBe(false)
  })

  it('detects a tampered clamped allocation (clamp mismatch → ✗)', () => {
    const d = buildDecision({ clampedAllocBps: [5000, 5000] })
    const result = verifyDecision(d, bounds)
    expect(result.ok).toBe(false)
    const clampCheck = result.checks.find((c) => c.label === 'Clamp recomputation')
    expect(clampCheck?.ok).toBe(false)
  })

  it('flags an unparseable raw proposal as a failed clamp check', () => {
    const broken = 'not-json'
    const d = buildDecision({ rawProposalJson: broken, rawProposalHash: hashString(broken) })
    const result = verifyDecision(d, bounds)
    expect(result.ok).toBe(false)
    const clampCheck = result.checks.find((c) => c.label === 'Clamp recomputation')
    expect(clampCheck?.ok).toBe(false)
    // but the hash of the (broken) string itself still matches what was emitted
    const proposalHash = result.checks.find((c) => c.label === 'Raw proposal hash')
    expect(proposalHash?.ok).toBe(true)
  })
})
