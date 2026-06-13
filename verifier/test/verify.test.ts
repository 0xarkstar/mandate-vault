import { describe, expect, it } from 'vitest'
import { canonicalJson, clamp, encryptString, hashString } from '@mandate-vault/clamp-core'
import {
  doVerify,
  tamperString,
  type DecisionDataEvent,
  type DecisionLoggedEvent
} from '../src/verify.js'
import { renderVerdict, type RenderContext } from '../src/render.js'

const ctx: RenderContext = {
  vault: '0x1111111111111111111111111111111111111111',
  rpcUrl: 'http://localhost:8545',
  blockNumber: 1n,
  transactionHash: null,
  tamper: null
}

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
  it('verifies a self-consistent decision', async () => {
    const { decisionData, decisionLogged } = fixture()
    const r = await doVerify(decisionData, decisionLogged, bounds)
    expect(r.verified).toBe(true)
    expect(r.hashChecks.map((h) => h.ok)).toEqual([true, true, true])
    expect(r.snapshotParse.ok).toBe(true)
    expect(r.proposalParse.ok).toBe(true)
    expect(r.regime).toBe('RISK_ON')
    expect(r.clampReplay.performed).toBe(true)
    expect(r.clampReplay.ok).toBe(true)
    expect(r.clampReplay.expectedBps).toEqual([3000, 7000])
    expect(r.epoch).toBe('1')
    expect(r.confidential).toBe(false)
    expect(r.contentVerified).toBe(true)
  })

  it('compares hashes case-insensitively', async () => {
    const { decisionData, decisionLogged } = fixture()
    const upper = {
      ...decisionLogged,
      inputSnapshotHash: decisionLogged.inputSnapshotHash.toUpperCase().replace('0X', '0x')
    }
    expect((await doVerify(decisionData, upper, bounds)).verified).toBe(true)
  })
})

describe('doVerify — tamper detection', () => {
  it('flags a tampered snapshot via hash mismatch (snapshot only)', async () => {
    const { decisionData, decisionLogged } = fixture()
    const tamper = tamperString(decisionData.snapshotJson)
    const r = await doVerify(
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

  it('flags a tampered rationale', async () => {
    const { decisionData, decisionLogged } = fixture()
    const r = await doVerify(
      { ...decisionData, rationale: `${decisionData.rationale}!` },
      decisionLogged,
      bounds
    )
    expect(r.verified).toBe(false)
    expect(r.hashChecks.find((h) => h.label === 'rationale')?.ok).toBe(false)
  })
})

describe('doVerify — clamp replay', () => {
  it('detects an on-chain allocation that does not match the replayed clamp', async () => {
    const { decisionData, decisionLogged } = fixture({ clampedAllocBps: [4000, 6000] })
    const r = await doVerify(decisionData, decisionLogged, bounds)
    expect(r.hashChecks.every((h) => h.ok)).toBe(true) // hashes are intact…
    expect(r.clampReplay.performed).toBe(true)
    expect(r.clampReplay.ok).toBe(false) // …but the clamp does not replay
    expect(r.clampReplay.expectedBps).toEqual([3000, 7000])
    expect(r.clampReplay.onchainBps).toEqual([4000, 6000])
    expect(r.verified).toBe(false)
  })

  it('reports a clamp failure (length mismatch vs bounds) without throwing', async () => {
    const badProposal = { ...proposal, targetAllocBps: [5000, 3000, 2000] }
    const rawProposalJson = canonicalJson(badProposal)
    const { decisionData, decisionLogged } = fixture({ rawProposalJson })
    const r = await doVerify(decisionData, decisionLogged, bounds)
    expect(r.proposalParse.ok).toBe(true) // schema allows 1-8 assets
    expect(r.clampReplay.performed).toBe(false)
    expect(r.clampReplay.ok).toBe(false)
    expect(r.clampReplay.reason).toContain('clamp replay failed')
    expect(r.verified).toBe(false)
  })
})

describe('doVerify — bounds drift (indeterminate)', () => {
  it('integrity ok + schemas parse, clamp differs vs CURRENT bounds → INDETERMINATE not TAMPERED', async () => {
    // On-chain allocation was clamped at the original epoch's bounds...
    const { decisionData, decisionLogged } = fixture()
    expect(decisionLogged.clampedAllocBps).toEqual([3000, 7000])
    // ...but the owner has since called setMandateBounds → verify with DIFFERENT bounds.
    const currentBounds = { minBps: [3000, 0], maxBps: [10_000, 5000] }
    const r = await doVerify(decisionData, decisionLogged, currentBounds)

    expect(r.hashChecks.every((h) => h.ok)).toBe(true) // integrity intact
    expect(r.integrityOk).toBe(true)
    expect(r.snapshotParse.ok).toBe(true)
    expect(r.proposalParse.ok).toBe(true)
    expect(r.clampReplay.performed).toBe(true)
    expect(r.clampReplay.ok).toBe(false) // recomputed [3000,5000] ≠ on-chain [3000,7000]
    expect(r.indeterminate).toBe(true)
    expect(r.verified).toBe(false)

    const verdictRow = renderVerdict(r, ctx)
      .split('\n')
      .find((l) => l.includes('VERDICT:'))
    expect(verdictRow).toContain('INDETERMINATE')
    expect(verdictRow).not.toContain('TAMPERED')
  })

  it('genuine snapshot tamper (hash break) → TAMPERED, not indeterminate', async () => {
    const { decisionData, decisionLogged } = fixture()
    const tamper = tamperString(decisionData.snapshotJson)
    const r = await doVerify({ ...decisionData, snapshotJson: tamper.tampered }, decisionLogged, bounds)

    expect(r.integrityOk).toBe(false)
    expect(r.indeterminate).toBe(false)
    expect(r.verified).toBe(false)

    const verdictRow = renderVerdict(r, ctx)
      .split('\n')
      .find((l) => l.includes('VERDICT:'))
    expect(verdictRow).toContain('TAMPERED')
    expect(verdictRow).not.toContain('INDETERMINATE')
  })
})

describe('doVerify — schema rejection', () => {
  it('rejects a proposal that fails ProposalSchema and skips the clamp replay', async () => {
    const rawProposalJson = canonicalJson({
      regime: 'YOLO',
      targetAllocBps: [10_000],
      rationale: 'x'
    })
    const { decisionData, decisionLogged } = fixture({ rawProposalJson })
    const r = await doVerify(decisionData, decisionLogged, bounds)
    expect(r.hashChecks.every((h) => h.ok)).toBe(true)
    expect(r.proposalParse.ok).toBe(false)
    expect(r.proposalParse.error).toContain('regime')
    expect(r.regime).toBeNull()
    expect(r.clampReplay.performed).toBe(false)
    expect(r.verified).toBe(false)
  })

  it('rejects a proposal that is not JSON at all', async () => {
    const { decisionData, decisionLogged } = fixture({ rawProposalJson: 'not-json{' })
    const r = await doVerify(decisionData, decisionLogged, bounds)
    expect(r.proposalParse.ok).toBe(false)
    expect(r.proposalParse.error).toContain('invalid JSON')
    expect(r.verified).toBe(false)
  })

  it('rejects a snapshot that fails SnapshotSchema', async () => {
    const snapshotJson = canonicalJson({ hello: 'world' })
    const { decisionData, decisionLogged } = fixture({ snapshotJson })
    const r = await doVerify(decisionData, decisionLogged, bounds)
    expect(r.hashChecks.every((h) => h.ok)).toBe(true)
    expect(r.snapshotParse.ok).toBe(false)
    expect(r.verified).toBe(false)
  })
})

describe('doVerify — input guards', () => {
  it('throws on an epoch mismatch between the two events', async () => {
    const { decisionData, decisionLogged } = fixture()
    await expect(doVerify(decisionData, { ...decisionLogged, epoch: 2n }, bounds)).rejects.toThrow(
      /epoch mismatch/
    )
  })
})

// --------------------------------------------------------- privacy-lite (confidential)

const VK = 'a'.repeat(64)

/** Build a confidential event pair: snapshot envelope (+ public siblings),
 * proposal/rationale envelopes; hashes commit to the published envelope strings. */
async function confidentialFixture(): Promise<{
  decisionData: DecisionDataEvent
  decisionLogged: DecisionLoggedEvent
}> {
  const innerSnapshot = canonicalJson(snapshot)
  const innerProposal = canonicalJson(proposal)
  const innerRationale = proposal.rationale

  const [snapEnv, proposalEnv, rationaleEnv] = await Promise.all([
    encryptString(innerSnapshot, VK),
    encryptString(innerProposal, VK),
    encryptString(innerRationale, VK)
  ])
  const snapshotJson = canonicalJson({ ...snapEnv, llmFallback: true })
  const rawProposalJson = canonicalJson(proposalEnv)
  const rationale = canonicalJson(rationaleEnv)
  const clampedAllocBps = clamp(proposal.targetAllocBps, bounds).clampedBps

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

describe('doVerify — confidential payloads', () => {
  it('with the viewing key: decrypts, replays, VERIFIED + confidential', async () => {
    const { decisionData, decisionLogged } = await confidentialFixture()
    const r = await doVerify(decisionData, decisionLogged, bounds, VK)
    expect(r.verified).toBe(true)
    expect(r.confidential).toBe(true)
    expect(r.contentVerified).toBe(true)
    expect(r.indeterminate).toBe(false)
    expect(r.hashChecks.every((h) => h.ok)).toBe(true)
    expect(r.snapshotParse.ok).toBe(true)
    expect(r.proposalParse.ok).toBe(true)
    expect(r.regime).toBe('RISK_ON')
    expect(r.clampReplay.ok).toBe(true)
    expect(r.clampReplay.expectedBps).toEqual([3000, 7000])
  })

  it('without a key: integrity verified, content locked', async () => {
    const { decisionData, decisionLogged } = await confidentialFixture()
    const r = await doVerify(decisionData, decisionLogged, bounds)
    expect(r.verified).toBe(true) // integrity (hashes) ok
    expect(r.confidential).toBe(true)
    expect(r.contentVerified).toBe(false)
    expect(r.integrityOk).toBe(true)
    expect(r.indeterminate).toBe(false)
    expect(r.hashChecks.every((h) => h.ok)).toBe(true)
    expect(r.snapshotParse.locked).toBe(true)
    expect(r.proposalParse.locked).toBe(true)
    expect(r.clampReplay.locked).toBe(true)
    expect(r.clampReplay.performed).toBe(false)
  })

  it('with the wrong key: clean failure, verified=false', async () => {
    const { decisionData, decisionLogged } = await confidentialFixture()
    const r = await doVerify(decisionData, decisionLogged, bounds, 'c'.repeat(64))
    expect(r.verified).toBe(false)
    expect(r.confidential).toBe(true)
    expect(r.contentVerified).toBe(false)
    expect(r.indeterminate).toBe(false) // confidential is never indeterminate
    expect(r.hashChecks.every((h) => h.ok)).toBe(true) // integrity still intact
    expect(r.snapshotParse.error).toContain('viewing key incorrect')
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
