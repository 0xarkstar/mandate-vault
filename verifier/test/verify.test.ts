import { describe, expect, it } from 'vitest'
import { canonicalJson, clamp, hashString } from '@mandate-vault/clamp-core'
import {
  doVerify,
  tamperString,
  type DecisionDataEvent,
  type DecisionLoggedEvent
} from '../src/verify.js'

// Balanced template bounds: mUSD 30-100%, mMETH 0-70%
const bounds = { minBps: [3000, 0], maxBps: [10_000, 7000] }

const snapshot = {
  ts: 1_770_000_000,
  chainId: 5003,
  vault: '0x1111111111111111111111111111111111111111',
  funding: { lastRate: '0.0001', mean7d: '0.00008', markPrice: '3200.5' },
  prices: {
    '0x2222222222222222222222222222222222222222': '1',
    '0x3333333333333333333333333333333333333333': '3200.5'
  },
  vaultState: {
    allocBps: [7000, 3000],
    sharePrice: '1000000000000000000',
    hwm: '1000000000000000000',
    tripped: false
  }
}

const proposal = {
  regime: 'RISK_ON',
  targetAllocBps: [2000, 8000], // out of bounds → clamps to [3000, 7000]
  rationale: 'funding positive and rising; rotate into mMETH'
}

interface FixtureOverrides {
  readonly snapshotJson?: string
  readonly rawProposalJson?: string
  readonly clampedAllocBps?: readonly number[]
}

/** Build a self-consistent event pair the way the agent would emit it. */
function fixture(overrides: FixtureOverrides = {}): {
  decisionData: DecisionDataEvent
  decisionLogged: DecisionLoggedEvent
} {
  const snapshotJson = overrides.snapshotJson ?? canonicalJson(snapshot)
  const rawProposalJson = overrides.rawProposalJson ?? canonicalJson(proposal)
  const rationale = proposal.rationale
  const clampedAllocBps =
    overrides.clampedAllocBps ?? clamp(proposal.targetAllocBps, bounds).clampedBps
  return {
    decisionData: { epoch: 1n, snapshotJson, rawProposalJson, rationale },
    decisionLogged: {
      epoch: 1n,
      inputSnapshotHash: hashString(snapshotJson),
      rawProposalHash: hashString(rawProposalJson),
      rationaleHash: hashString(rationale),
      clampedAllocBps
    }
  }
}

describe('doVerify — happy path', () => {
  it('verifies a self-consistent decision', () => {
    const { decisionData, decisionLogged } = fixture()
    const r = doVerify(decisionData, decisionLogged, bounds)
    expect(r.verified).toBe(true)
    expect(r.hashChecks.map((h) => h.ok)).toEqual([true, true, true])
    expect(r.snapshotParse.ok).toBe(true)
    expect(r.proposalParse.ok).toBe(true)
    expect(r.regime).toBe('RISK_ON')
    expect(r.clampReplay.performed).toBe(true)
    expect(r.clampReplay.ok).toBe(true)
    expect(r.clampReplay.expectedBps).toEqual([3000, 7000])
    expect(r.epoch).toBe('1')
  })

  it('compares hashes case-insensitively', () => {
    const { decisionData, decisionLogged } = fixture()
    const upper = {
      ...decisionLogged,
      inputSnapshotHash: decisionLogged.inputSnapshotHash.toUpperCase().replace('0X', '0x')
    }
    expect(doVerify(decisionData, upper, bounds).verified).toBe(true)
  })
})

describe('doVerify — tamper detection', () => {
  it('flags a tampered snapshot via hash mismatch (snapshot only)', () => {
    const { decisionData, decisionLogged } = fixture()
    const tamper = tamperString(decisionData.snapshotJson)
    const r = doVerify(
      { ...decisionData, snapshotJson: tamper.tampered },
      decisionLogged,
      bounds
    )
    expect(r.verified).toBe(false)
    expect(r.hashChecks.find((h) => h.label === 'snapshot')?.ok).toBe(false)
    expect(r.hashChecks.find((h) => h.label === 'proposal')?.ok).toBe(true)
    expect(r.hashChecks.find((h) => h.label === 'rationale')?.ok).toBe(true)
    // digit flip keeps the JSON valid — the hash, not a parse error, catches it
    expect(r.snapshotParse.ok).toBe(true)
  })

  it('flags a tampered rationale', () => {
    const { decisionData, decisionLogged } = fixture()
    const r = doVerify(
      { ...decisionData, rationale: `${decisionData.rationale}!` },
      decisionLogged,
      bounds
    )
    expect(r.verified).toBe(false)
    expect(r.hashChecks.find((h) => h.label === 'rationale')?.ok).toBe(false)
  })
})

describe('doVerify — clamp replay', () => {
  it('detects an on-chain allocation that does not match the replayed clamp', () => {
    const { decisionData, decisionLogged } = fixture({ clampedAllocBps: [4000, 6000] })
    const r = doVerify(decisionData, decisionLogged, bounds)
    expect(r.hashChecks.every((h) => h.ok)).toBe(true) // hashes are intact…
    expect(r.clampReplay.performed).toBe(true)
    expect(r.clampReplay.ok).toBe(false) // …but the clamp does not replay
    expect(r.clampReplay.expectedBps).toEqual([3000, 7000])
    expect(r.clampReplay.onchainBps).toEqual([4000, 6000])
    expect(r.verified).toBe(false)
  })

  it('reports a clamp failure (length mismatch vs bounds) without throwing', () => {
    const badProposal = { ...proposal, targetAllocBps: [5000, 3000, 2000] }
    const rawProposalJson = canonicalJson(badProposal)
    const { decisionData, decisionLogged } = fixture({ rawProposalJson })
    const r = doVerify(decisionData, decisionLogged, bounds)
    expect(r.proposalParse.ok).toBe(true) // schema allows 1-8 assets
    expect(r.clampReplay.performed).toBe(false)
    expect(r.clampReplay.ok).toBe(false)
    expect(r.clampReplay.reason).toContain('clamp replay failed')
    expect(r.verified).toBe(false)
  })
})

describe('doVerify — schema rejection', () => {
  it('rejects a proposal that fails ProposalSchema and skips the clamp replay', () => {
    const rawProposalJson = canonicalJson({
      regime: 'YOLO',
      targetAllocBps: [10_000],
      rationale: 'x'
    })
    const { decisionData, decisionLogged } = fixture({ rawProposalJson })
    const r = doVerify(decisionData, decisionLogged, bounds)
    expect(r.hashChecks.every((h) => h.ok)).toBe(true)
    expect(r.proposalParse.ok).toBe(false)
    expect(r.proposalParse.error).toContain('regime')
    expect(r.regime).toBeNull()
    expect(r.clampReplay.performed).toBe(false)
    expect(r.verified).toBe(false)
  })

  it('rejects a proposal that is not JSON at all', () => {
    const { decisionData, decisionLogged } = fixture({ rawProposalJson: 'not-json{' })
    const r = doVerify(decisionData, decisionLogged, bounds)
    expect(r.proposalParse.ok).toBe(false)
    expect(r.proposalParse.error).toContain('invalid JSON')
    expect(r.verified).toBe(false)
  })

  it('rejects a snapshot that fails SnapshotSchema', () => {
    const snapshotJson = canonicalJson({ hello: 'world' })
    const { decisionData, decisionLogged } = fixture({ snapshotJson })
    const r = doVerify(decisionData, decisionLogged, bounds)
    expect(r.hashChecks.every((h) => h.ok)).toBe(true)
    expect(r.snapshotParse.ok).toBe(false)
    expect(r.verified).toBe(false)
  })
})

describe('doVerify — input guards', () => {
  it('throws on an epoch mismatch between the two events', () => {
    const { decisionData, decisionLogged } = fixture()
    expect(() => doVerify(decisionData, { ...decisionLogged, epoch: 2n }, bounds)).toThrow(
      /epoch mismatch/
    )
  })
})

describe('tamperString', () => {
  it('mutates exactly one character and keeps JSON valid', () => {
    const s = canonicalJson(snapshot)
    const t = tamperString(s)
    expect(t.tampered).not.toBe(s)
    expect(t.tampered.length).toBe(s.length)
    expect(t.from).not.toBe(t.to)
    expect(() => JSON.parse(t.tampered)).not.toThrow()
    expect(hashString(t.tampered)).not.toBe(hashString(s))
  })

  it('flips 9 → 8 to avoid creating leading-zero JSON numbers', () => {
    expect(tamperString('{"a":9}').tampered).toBe('{"a":8}')
    expect(tamperString('{"a":4}').tampered).toBe('{"a":5}')
  })

  it('is deterministic', () => {
    const s = canonicalJson(snapshot)
    expect(tamperString(s)).toEqual(tamperString(s))
  })

  it('still mutates a string with no digits', () => {
    const t = tamperString('abc')
    expect(t.tampered).not.toBe('abc')
  })
})
