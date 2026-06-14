import { describe, it, expect } from 'vitest'
import { deriveDecisionFlow } from '../src/lib/decision-flow'
import type { Decision, Mandate } from '../src/lib/types'
import type { DecisionTca } from '../src/lib/fills-tca'

const MANDATE: Mandate = {
  assets: ['0x1' as `0x${string}`, '0x2' as `0x${string}`],
  minBps: [3000, 0],
  maxBps: [10_000, 7000],
  maxDrawdownBps: 1000,
  rebalanceCooldown: 3600,
  mgmtFeeBpsPerYear: 100,
  perfFeeBps: 1000,
  hurdleBpsPerYear: 450,
  agent: '0x3' as `0x${string}`,
  tripMode: 'FREEZE'
}

function decision(over: Partial<Decision> = {}): Decision {
  return {
    epoch: 3,
    txHash: '0xabc' as `0x${string}`,
    blockNumber: 1n,
    timestamp: null,
    inputSnapshotHash: '0x' as `0x${string}`,
    rawProposalHash: '0x' as `0x${string}`,
    rationaleHash: '0x' as `0x${string}`,
    clampedAllocBps: [3000, 7000],
    snapshotJson: JSON.stringify({ funding: { lastRate: '0.0001' }, prices: { a: '1', b: '2' } }),
    rawProposalJson: JSON.stringify({ regime: 'RISK_OFF', targetAllocBps: [3000, 7000] }),
    rationale: 'because',
    ...over
  }
}

const SYMBOLS = ['mUSD', 'mMETH'] as const

describe('deriveDecisionFlow', () => {
  it('builds three lanes in WHAT → HOW → SETTLED order', () => {
    const m = deriveDecisionFlow(decision(), MANDATE, SYMBOLS, undefined, false)
    expect(m.lanes.map((l) => l.key)).toEqual(['deliberation', 'execution', 'chain'])
    expect(m.lanes[0]!.tag).toBe('LLM')
    expect(m.lanes[1]!.tag).toBe('NO LLM')
  })

  it('marks the fill outcome with +bps when there is a fill', () => {
    const tca: DecisionTca = { fillCount: 2, avgImprovementBps: 4, fills: [] }
    const m = deriveDecisionFlow(decision(), MANDATE, SYMBOLS, tca, false)
    expect(m.outcome.tone).toBe('good')
    expect(m.outcome.label).toContain('+4.0 bps')
    const settle = m.lanes[2]!.stages.find((s) => s.id === 'settle')!
    expect(settle.value).toContain('+4.0 bps')
  })

  it('shows held / on-target when there is no fill', () => {
    const m = deriveDecisionFlow(decision(), MANDATE, SYMBOLS, undefined, false)
    expect(m.outcome.label).toMatch(/held|caged/)
    const rfq = m.lanes[1]!.stages.find((s) => s.id === 'rfq')!
    expect(rfq.state).toBe('held')
  })

  it('flags the clamp stage as caged when the proposal was pulled in', () => {
    const d = decision({
      rawProposalJson: JSON.stringify({ regime: 'RISK_ON', targetAllocBps: [1000, 9000] }),
      clampedAllocBps: [3000, 7000]
    })
    const m = deriveDecisionFlow(d, MANDATE, SYMBOLS, undefined, false)
    const clamp = m.lanes[1]!.stages.find((s) => s.id === 'clamp')!
    expect(clamp.state).toBe('caged')
  })

  it('marks propose as det/fallback and llm=false when llmFallback', () => {
    const d = decision({
      snapshotJson: JSON.stringify({ llmFallback: true, funding: { lastRate: '0.0001' } }),
      rawProposalJson: JSON.stringify({ regime: 'NEUTRAL', targetAllocBps: [10_000, 0] })
    })
    const m = deriveDecisionFlow(d, MANDATE, SYMBOLS, undefined, false)
    const propose = m.lanes[0]!.stages.find((s) => s.id === 'propose')!
    expect(propose.state).toBe('fallback')
    expect(propose.llm).toBe(false)
  })

  it('locks the snapshot/propose values for a confidential decision', () => {
    const m = deriveDecisionFlow(decision(), MANDATE, SYMBOLS, undefined, true)
    expect(m.confidential).toBe(true)
    const snap = m.lanes[0]!.stages.find((s) => s.id === 'snapshot')!
    expect(snap.state).toBe('locked')
    expect(snap.value).toContain('🔒')
  })
})
