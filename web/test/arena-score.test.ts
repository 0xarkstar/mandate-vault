import { describe, it, expect } from 'vitest'
import { arenaScore, IMPROVEMENT_NORM_BPS } from '../src/lib/arena-score'

describe('arenaScore', () => {
  it('awards a perfect 100 for max improvement, zero cage hits, zero fallback', () => {
    const s = arenaScore({
      avgImprovementBps: IMPROVEMENT_NORM_BPS,
      cageHitRate: 0,
      fallbackRate: 0
    })
    expect(s.score).toBe(100)
    expect(s).toMatchObject({ execution: 50, mandateFit: 30, autonomy: 20 })
  })

  it('floors negative improvement to zero execution score', () => {
    const s = arenaScore({ avgImprovementBps: -50, cageHitRate: 0, fallbackRate: 0 })
    expect(s.execution).toBe(0)
    expect(s.score).toBe(50) // mandateFit 30 + autonomy 20
  })

  it('penalises cage hits and fallback proportionally', () => {
    const s = arenaScore({
      avgImprovementBps: IMPROVEMENT_NORM_BPS / 2,
      cageHitRate: 0.5,
      fallbackRate: 0.25
    })
    // execution 25 + mandateFit 15 + autonomy 15 = 55
    expect(s).toMatchObject({ execution: 25, mandateFit: 15, autonomy: 15, score: 55 })
  })

  it('clamps rates above 1 and improvement above the norm', () => {
    const s = arenaScore({ avgImprovementBps: 999, cageHitRate: 2, fallbackRate: 2 })
    expect(s.execution).toBe(50)
    expect(s.mandateFit).toBe(0)
    expect(s.autonomy).toBe(0)
    expect(s.score).toBe(50)
  })

  it('treats non-finite improvement as zero (no fills)', () => {
    const s = arenaScore({ avgImprovementBps: Number.NaN, cageHitRate: 0, fallbackRate: 0 })
    expect(s.execution).toBe(0)
    expect(s.score).toBe(50)
  })
})
