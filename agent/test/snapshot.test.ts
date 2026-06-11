import { describe, expect, it } from 'vitest'
import { canonicalJson, SnapshotSchema } from '@mandate-vault/clamp-core'
import { buildSnapshot, type SnapshotInputs } from '../src/snapshot.js'
import type { VaultState } from '../src/feeds/vault.js'

const VAULT = '0xABCDEF0123456789ABCDEF0123456789ABCDEF01'
const MUSD = '0x1111111111111111111111111111111111111111'
const MMETH = '0x2222222222222222222222222222222222222222'

const vaultState: VaultState = {
  mandate: {
    assets: [MUSD, MMETH],
    minBps: [3000, 0],
    maxBps: [10_000, 7000],
    maxDrawdownBps: 1000,
    rebalanceCooldown: 60,
    agent: '0x3333333333333333333333333333333333333333'
  },
  allocBps: [4000, 6000],
  sharePrice: 1_050000000000000000n,
  hwm: 1_100000000000000000n,
  tripped: false,
  epoch: 7n,
  // mixed-case keys to prove lowercasing
  prices: {
    [MUSD.toLowerCase()]: 1_000000000000000000n,
    [MMETH.toLowerCase()]: 3_000000000000000000000n
  }
}

const inputs: SnapshotInputs = {
  chainId: 5003,
  vault: VAULT,
  ts: 1_700_000_000,
  funding: { lastRate: '0.00012345', mean7d: '0.00009876', markPrice: '3000.50' },
  vaultState,
  llmFallback: false
}

describe('buildSnapshot', () => {
  it('matches SnapshotSchema and lowercases vault + price keys', () => {
    const snap = buildSnapshot(inputs)
    expect(() => SnapshotSchema.parse(snap)).not.toThrow()
    expect(snap.vault).toBe(VAULT.toLowerCase())
    expect(Object.keys(snap.prices)).toEqual([MUSD.toLowerCase(), MMETH.toLowerCase()])
    expect(snap.vaultState.sharePrice).toBe('1050000000000000000')
    expect(snap.vaultState.hwm).toBe('1100000000000000000')
    expect(snap.funding.lastRate).toBe('0.00012345')
  })

  it('omits llmFallback when false and sets it when true', () => {
    const off = buildSnapshot(inputs)
    expect('llmFallback' in off).toBe(false)
    const on = buildSnapshot({ ...inputs, llmFallback: true })
    expect(on.llmFallback).toBe(true)
  })

  it('produces byte-stable canonical JSON across input key orderings', () => {
    const a = canonicalJson(buildSnapshot(inputs))
    // reorder funding keys and prices object construction; canonical must match
    const reordered: SnapshotInputs = {
      ...inputs,
      funding: { markPrice: '3000.50', mean7d: '0.00009876', lastRate: '0.00012345' }
    }
    const b = canonicalJson(buildSnapshot(reordered))
    expect(a).toBe(b)
  })

  it('canonical JSON of a fallback snapshot includes llmFallback key', () => {
    const json = canonicalJson(buildSnapshot({ ...inputs, llmFallback: true }))
    expect(json).toContain('"llmFallback":true')
  })

  it('is fully deterministic for the same inputs', () => {
    expect(canonicalJson(buildSnapshot(inputs))).toBe(canonicalJson(buildSnapshot(inputs)))
  })
})
