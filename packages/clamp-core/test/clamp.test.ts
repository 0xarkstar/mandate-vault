import { describe, expect, it } from 'vitest'
import { canonicalJson, clamp, fallbackAllocation, hashString, ProposalSchema } from '../src/index.js'

// Balanced template bounds: mUSD 30-100%, mMETH 0-70%
const balanced = { minBps: [3000, 0], maxBps: [10_000, 7000] }

describe('clamp', () => {
  it('passes through an in-bounds proposal unchanged', () => {
    const r = clamp([4000, 6000], balanced)
    expect(r.clampedBps).toEqual([4000, 6000])
    expect(r.violations).toEqual([])
    expect(r.unchanged).toBe(true)
  })

  it('clamps per-asset violations and repairs the sum into the safe asset first', () => {
    // raw proposal: 20/80 → mUSD below min(30%), mMETH above max(70%)
    const r = clamp([2000, 8000], balanced)
    expect(r.violations.map((v) => v.index)).toEqual([0, 1])
    // per-asset clamp → [3000, 7000], sum already 10000
    expect(r.clampedBps).toEqual([3000, 7000])
    expect(r.unchanged).toBe(false)
  })

  it('repairs a deficit by filling the lowest index (safety-first)', () => {
    // [0, 5000] → clamp [3000, 5000] = 8000; deficit 2000 → mUSD gets it
    const r = clamp([0, 5000], balanced)
    expect(r.clampedBps).toEqual([5000, 5000])
    expect(r.clampedBps.reduce((a, b) => a + b, 0)).toBe(10_000)
  })

  it('repairs an excess from the highest index (risk reduced first)', () => {
    // 3-asset case: [5000, 4000, 3000] sums to 12000 with wide bounds
    const bounds = { minBps: [2000, 0, 0], maxBps: [10_000, 8000, 2000] }
    const r = clamp([5000, 4000, 3000], bounds)
    // per-asset: [5000, 4000, 2000] = 11000; excess 1000 removed from index 2 first (highest with room)
    expect(r.clampedBps).toEqual([5000, 4000, 1000])
  })

  it('is deterministic', () => {
    const a = clamp([2000, 8000], balanced)
    const b = clamp([2000, 8000], balanced)
    expect(a).toEqual(b)
  })

  it('throws on length mismatch', () => {
    expect(() => clamp([10_000], balanced)).toThrow(/length mismatch/)
  })

  it('throws on non-integer or out-of-range bps', () => {
    expect(() => clamp([5000.5, 4999.5], balanced)).toThrow(/out of range/)
    expect(() => clamp([-1, 10_001], balanced)).toThrow(/out of range/)
  })

  it('fallbackAllocation holds current allocation within bounds', () => {
    expect(fallbackAllocation([5000, 5000], balanced)).toEqual([5000, 5000])
    expect(fallbackAllocation([1000, 9000], balanced)).toEqual([3000, 7000])
  })
})

describe('canonicalJson', () => {
  it('sorts keys recursively and is insertion-order independent', () => {
    const a = canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 2 } })
    const b = canonicalJson({ a: { c: 2, d: [1, { y: 2, z: 1 }] }, b: 1 })
    expect(a).toBe(b)
    expect(a).toBe('{"a":{"c":2,"d":[1,{"y":2,"z":1}]},"b":1}')
  })

  it('drops undefined values and preserves arrays', () => {
    expect(canonicalJson({ a: undefined, b: [3, 1, 2] })).toBe('{"b":[3,1,2]}')
  })
})

describe('hashString', () => {
  it('matches solidity keccak256(bytes(s)) for a known vector', () => {
    // cast keccak abc → solidity keccak256("abc")
    expect(hashString('abc')).toBe('0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45')
  })
})

describe('ProposalSchema', () => {
  it('accepts a valid LLM proposal', () => {
    const p = ProposalSchema.parse({
      regime: 'RISK_ON',
      targetAllocBps: [3000, 7000],
      rationale: 'funding positive and rising; carry attractive vs T-bill baseline'
    })
    expect(p.regime).toBe('RISK_ON')
  })

  it('rejects malformed output', () => {
    expect(() => ProposalSchema.parse({ regime: 'YOLO', targetAllocBps: [10_000], rationale: 'x' })).toThrow()
    expect(() => ProposalSchema.parse({ regime: 'NEUTRAL', targetAllocBps: [99_999], rationale: 'x' })).toThrow()
  })
})
