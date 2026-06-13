import { describe, expect, it } from 'vitest'
import { distillDecisions, type DecisionRecord } from '../src/learn/distill.js'
import { compilePolicyIndex, PolicyIndexSchema } from '../src/learn/index.js'

function record(partial: Partial<DecisionRecord>): DecisionRecord {
  return {
    epoch: 1,
    regime: 'NEUTRAL',
    rawBps: [5000, 5000],
    clampedBps: [5000, 5000],
    cageHit: false,
    llmFallback: false,
    playbookVersion: 0,
    fillImprovementsBps: [],
    blockNumber: 100n,
    ...partial
  }
}

describe('distillDecisions', () => {
  it('aggregates per regime', () => {
    const stats = distillDecisions([
      record({ regime: 'RISK_ON', cageHit: true, fillImprovementsBps: [5, -2] }),
      record({ regime: 'RISK_ON', fillImprovementsBps: [3] }),
      record({ regime: 'RISK_OFF', llmFallback: true })
    ])
    expect(stats.RISK_ON!.decisions).toBe(2)
    expect(stats.RISK_ON!.cageHits).toBe(1)
    expect(stats.RISK_ON!.fills).toBe(3)
    expect(stats.RISK_ON!.avgImprovementBps).toBe(2) // (5-2+3)/3
    expect(stats.RISK_ON!.worstImprovementBps).toBe(-2)
    expect(stats.RISK_OFF!.fallbacks).toBe(1)
  })

  it('reports the true worst for an all-positive regime (no 0 seed)', () => {
    const stats = distillDecisions([
      record({ regime: 'RISK_ON', fillImprovementsBps: [4, 4] }),
      record({ regime: 'RISK_ON', epoch: 2, fillImprovementsBps: [4] })
    ])
    expect(stats.RISK_ON!.fills).toBe(3)
    expect(stats.RISK_ON!.worstImprovementBps).toBe(4)
  })

  it('reports the true worst for a mixed regime', () => {
    const stats = distillDecisions([record({ regime: 'RISK_ON', fillImprovementsBps: [5, -2] })])
    expect(stats.RISK_ON!.worstImprovementBps).toBe(-2)
  })

  it('reports worst 0 when a regime has no fills', () => {
    const stats = distillDecisions([record({ regime: 'RISK_ON', fillImprovementsBps: [] })])
    expect(stats.RISK_ON!.fills).toBe(0)
    expect(stats.RISK_ON!.worstImprovementBps).toBe(0)
  })

  it('handles an empty history', () => {
    expect(distillDecisions([])).toEqual({})
  })
})

describe('compilePolicyIndex', () => {
  it('bumps the version and records the high-water block', () => {
    const idx = compilePolicyIndex([record({ blockNumber: 42n }), record({ epoch: 2, blockNumber: 99n })], 3)
    expect(idx.version).toBe(4)
    expect(idx.updatedAtBlock).toBe('99')
    expect(PolicyIndexSchema.safeParse(idx).success).toBe(true)
  })

  it('emits a cage-hit hint above the 30% threshold', () => {
    const records = [
      record({ cageHit: true }),
      record({ epoch: 2, cageHit: true }),
      record({ epoch: 3, cageHit: false })
    ]
    const idx = compilePolicyIndex(records, 0)
    expect(idx.regimeHints.NEUTRAL!.cageHitRate).toBeCloseTo(0.667, 2)
    expect(idx.regimeHints.NEUTRAL!.hint).toContain('cage hits')
  })

  it('emits a routing hint when RFQ fills beat mid', () => {
    const idx = compilePolicyIndex([record({ fillImprovementsBps: [5, 5] })], 0)
    expect(idx.regimeHints.NEUTRAL!.hint).toContain('keep routing')
  })
})
