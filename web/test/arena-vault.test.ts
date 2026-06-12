import { describe, it, expect } from 'vitest'
import { summarizeVault } from '../src/lib/arena-vault'
import type { Decision, Fill } from '../src/lib/types'

function decision(
  epoch: number,
  rawBps: number[],
  clampedBps: number[],
  snapshot: Record<string, unknown> = {}
): Decision {
  return {
    epoch,
    txHash: `0x${epoch.toString(16).padStart(64, '0')}` as `0x${string}`,
    blockNumber: BigInt(epoch),
    timestamp: null,
    inputSnapshotHash: '0x' as `0x${string}`,
    rawProposalHash: '0x' as `0x${string}`,
    rationaleHash: '0x' as `0x${string}`,
    clampedAllocBps: clampedBps,
    snapshotJson: JSON.stringify(snapshot),
    rawProposalJson: JSON.stringify({ targetAllocBps: rawBps }),
    rationale: ''
  }
}

function fill(txHash: string, improvementBps: number): Fill {
  return {
    txHash: txHash as `0x${string}`,
    blockNumber: 1n,
    mm: '0x00000000000000000000000000000000000000aa' as `0x${string}`,
    assetIn: '0x00000000000000000000000000000000000000bb' as `0x${string}`,
    assetOut: '0x00000000000000000000000000000000000000cc' as `0x${string}`,
    amountIn: 1n,
    amountOut: 1n,
    oracleMidOut: 1n,
    improvementBps
  }
}

const MIN = [3000, 0]
const MAX = [10_000, 7000]

describe('summarizeVault', () => {
  it('summarises a clean vault: no cage hits, no fallback, positive improvement', () => {
    const decisions = [
      decision(1, [4000, 6000], [4000, 6000]),
      decision(2, [5000, 5000], [5000, 5000])
    ]
    // fills join by the decisions' tx hashes; a foreign tx (another vault on
    // the same venue) must NOT count toward this vault's score
    const fills = [
      fill(decisions[0]!.txHash, 10),
      fill(decisions[1]!.txHash, 30),
      fill('0xffff', 500)
    ]
    const row = summarizeVault(decisions, fills, MIN, MAX)

    expect(row.decisionCount).toBe(2)
    expect(row.avgImprovementBps).toBe(20) // foreign 500bps fill excluded
    expect(row.cageHitRate).toBe(0)
    expect(row.fallbackRate).toBe(0)
    expect(row.score.score).toBeGreaterThan(0)
  })

  it('counts cage hits and fallback decisions', () => {
    const decisions = [
      // raw 90% risk → clamped to 70%: both legs moved → cageHitRate 1 for this decision
      decision(1, [1000, 9000], [3000, 7000], { llmFallback: true }),
      // clean decision
      decision(2, [5000, 5000], [5000, 5000])
    ]
    const row = summarizeVault(decisions, [], MIN, MAX)

    expect(row.cageHitRate).toBe(0.5) // (1 + 0) / 2
    expect(row.fallbackRate).toBe(0.5) // 1 of 2 decisions fell back
    expect(row.avgImprovementBps).toBe(0) // no fills
  })

  it('scores an empty vault 0 — no behavior, no baseline credit', () => {
    const row = summarizeVault([], [fill('0xaaa', 10)], MIN, MAX)
    expect(row).toMatchObject({ decisionCount: 0, avgImprovementBps: 0, cageHitRate: 0, fallbackRate: 0 })
    expect(row.score.score).toBe(0)
  })
})
