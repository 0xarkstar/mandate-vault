import { describe, it, expect } from 'vitest'
import { computeClampDelta, extractTargetBps, extractRegime } from '../src/lib/clamp-delta'

describe('computeClampDelta', () => {
  it('reports no change when raw equals clamped', () => {
    const d = computeClampDelta([7000, 3000], [7000, 3000])
    expect(d.anyChanged).toBe(false)
    expect(d.rows.every((r) => r.delta === 0)).toBe(true)
  })

  it('computes per-asset deltas when the clamp engaged', () => {
    // raw proposes 90% risk asset, clamped pulls it back to 70%
    const d = computeClampDelta([1000, 9000], [3000, 7000])
    expect(d.anyChanged).toBe(true)
    expect(d.rows[0]).toMatchObject({ raw: 1000, clamped: 3000, delta: 2000, changed: true })
    expect(d.rows[1]).toMatchObject({ raw: 9000, clamped: 7000, delta: -2000, changed: true })
  })

  it('treats missing raw entries as 0 (malformed proposal)', () => {
    const d = computeClampDelta([], [7000, 3000])
    expect(d.rows).toHaveLength(2)
    expect(d.rows[0]).toMatchObject({ raw: 0, clamped: 7000, delta: 7000 })
  })

  it('treats missing clamped entries as 0', () => {
    const d = computeClampDelta([5000, 5000], [10_000])
    expect(d.rows).toHaveLength(2)
    expect(d.rows[1]).toMatchObject({ raw: 5000, clamped: 0, delta: -5000 })
  })
})

describe('extractTargetBps', () => {
  it('parses a valid targetAllocBps array', () => {
    expect(extractTargetBps('{"targetAllocBps":[3000,7000],"regime":"NEUTRAL"}')).toEqual([3000, 7000])
  })

  it('returns [] for invalid JSON', () => {
    expect(extractTargetBps('not json')).toEqual([])
  })

  it('returns [] when the field is missing', () => {
    expect(extractTargetBps('{"regime":"RISK_ON"}')).toEqual([])
  })

  it('returns [] when the field is the wrong type', () => {
    expect(extractTargetBps('{"targetAllocBps":"7000"}')).toEqual([])
  })

  it('returns [] for a confidential envelope (no targetAllocBps; does not crash)', () => {
    const envelope = '{"v":1,"alg":"A256GCM","iv":"AAAA","enc":"BBBB"}'
    expect(extractTargetBps(envelope)).toEqual([])
  })
})

describe('extractRegime', () => {
  it('parses each known regime', () => {
    expect(extractRegime('{"regime":"RISK_ON"}')).toBe('RISK_ON')
    expect(extractRegime('{"regime":"NEUTRAL"}')).toBe('NEUTRAL')
    expect(extractRegime('{"regime":"RISK_OFF"}')).toBe('RISK_OFF')
  })

  it('returns null for unknown or missing regime', () => {
    expect(extractRegime('{"regime":"PANIC"}')).toBeNull()
    expect(extractRegime('{}')).toBeNull()
    expect(extractRegime('broken')).toBeNull()
  })

  it('returns null for a confidential envelope (no regime; does not crash)', () => {
    expect(extractRegime('{"v":1,"alg":"A256GCM","iv":"AAAA","enc":"BBBB"}')).toBeNull()
  })
})
