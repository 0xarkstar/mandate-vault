import { describe, expect, it } from 'vitest'
import type { Proposal } from '@mandate-vault/clamp-core'
import { gateDecision } from '../src/deliberate/gate.js'
import { deterministicReview, parseVerdictContent, pickReviewerModel } from '../src/deliberate/review.js'
import { draftMandate } from '../src/deliberate/onboard.js'
import { MODELS } from '../src/llm.js'
import type { MandateView } from '../src/feeds/vault.js'

const MANDATE: MandateView = {
  assets: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'],
  minBps: [3000, 0],
  maxBps: [10_000, 7000],
  maxDrawdownBps: 1000,
  rebalanceCooldown: 3600,
  agent: '0x3333333333333333333333333333333333333333'
}

const PROPOSAL: Proposal = { regime: 'NEUTRAL', targetAllocBps: [4000, 6000], rationale: 'hold-ish' }

describe('parseVerdictContent', () => {
  it('parses a clean verdict', () => {
    expect(parseVerdictContent('{"verdict":"approved","reason":"in bounds"}')).toEqual({
      verdict: 'approved',
      reason: 'in bounds'
    })
  })

  it('parses through markdown fences and prose', () => {
    const v = parseVerdictContent('Sure!\n```json\n{"verdict":"hold","reason":"sum off"}\n```')
    expect(v?.verdict).toBe('hold')
  })

  it('rejects schema mismatches', () => {
    expect(parseVerdictContent('{"verdict":"maybe","reason":"x"}')).toBeNull()
    expect(parseVerdictContent('not json')).toBeNull()
    expect(parseVerdictContent('')).toBeNull()
  })
})

describe('deterministicReview', () => {
  it('approves an in-bounds proposal summing to 10000', () => {
    expect(deterministicReview(PROPOSAL, MANDATE).verdict).toBe('approved')
  })

  it('holds on out-of-bounds allocation', () => {
    const v = deterministicReview({ ...PROPOSAL, targetAllocBps: [2000, 8000] }, MANDATE)
    expect(v.verdict).toBe('hold')
    expect(v.reason).toContain('outside')
  })

  it('holds on bad sum', () => {
    expect(deterministicReview({ ...PROPOSAL, targetAllocBps: [4000, 5000] }, MANDATE).verdict).toBe('hold')
  })

  it('holds on length mismatch', () => {
    expect(deterministicReview({ ...PROPOSAL, targetAllocBps: [10_000] }, MANDATE).verdict).toBe('hold')
  })
})

describe('pickReviewerModel — proposer ≠ reviewer invariant', () => {
  it('never returns the proposer model', () => {
    for (const m of MODELS) {
      expect(pickReviewerModel(m)).not.toBe(m)
    }
  })
})

describe('gateDecision', () => {
  const base = {
    vault: '0x4444444444444444444444444444444444444444',
    proposal: PROPOSAL,
    maxSlippageBps: 50,
    playbookVersion: 0,
    snapshotHash: '0xabc'
  }

  it('emits an ExecutionIntent on approval', () => {
    const out = gateDecision({ ...base, verdict: { verdict: 'approved', reason: 'ok' } })
    expect(out.action).toBe('act')
    if (out.action === 'act') {
      expect(out.intent.targetAllocBps).toEqual([4000, 6000])
      expect(out.intent.reviewVerdict.verdict).toBe('approved')
      expect(out.intent.snapshotHash).toBe('0xabc')
    }
  })

  it('holds when the reviewer holds', () => {
    const out = gateDecision({ ...base, verdict: { verdict: 'hold', reason: 'regime mismatch' } })
    expect(out.action).toBe('hold')
    if (out.action === 'hold') expect(out.reason).toContain('regime mismatch')
  })

  it('holds on malformed allocations even when approved', () => {
    const out = gateDecision({
      ...base,
      proposal: { ...PROPOSAL, targetAllocBps: [4000.5, 5999.5] },
      verdict: { verdict: 'approved', reason: 'ok' }
    })
    expect(out.action).toBe('hold')
  })
})

describe('draftMandate (onboarding thin slice)', () => {
  it('fully-specified intent → low ambiguity', () => {
    const r = draftMandate(
      'Conservative treasury reserve; max drawdown 5%; on a breach hold positions, do not sell; rebalance every 4 hours.'
    )
    expect(r.ambiguityScore).toBe(0)
    expect(r.draft.maxDrawdownBps).toBe(500)
    expect(r.draft.tripMode).toBe('freeze')
    expect(r.draft.rebalanceCooldown).toBe(4 * 3600)
    expect(r.questions).toHaveLength(0)
  })

  it('vague intent → high ambiguity with questions, defaults safest', () => {
    const r = draftMandate('make my money work')
    expect(r.ambiguityScore).toBeGreaterThanOrEqual(0.75)
    expect(r.questions.length).toBeGreaterThanOrEqual(3)
    expect(r.draft.minBps[0]).toBe(7000) // conservative default
    expect(r.draft.tripMode).toBe('freeze')
  })

  it('detects derisk preference', () => {
    const r = draftMandate('aggressive growth, but if we breach drawdown sell everything to stables')
    expect(r.draft.tripMode).toBe('derisk')
    expect(r.draft.maxBps[1]).toBe(8000)
  })

  it('explicit drawdown number overrides the profile default', () => {
    const r = draftMandate('balanced portfolio with maximum drawdown 8%')
    expect(r.draft.maxDrawdownBps).toBe(800)
  })
})
