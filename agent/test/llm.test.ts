import { describe, expect, it } from 'vitest'
import { parseProposalContent } from '../src/llm.js'

const valid = {
  regime: 'RISK_ON',
  targetAllocBps: [3000, 7000],
  rationale: 'funding positive and rising; carry attractive vs T-bill baseline'
}

describe('parseProposalContent', () => {
  it('parses bare JSON', () => {
    const p = parseProposalContent(JSON.stringify(valid))
    expect(p).not.toBeNull()
    expect(p?.regime).toBe('RISK_ON')
    expect(p?.targetAllocBps).toEqual([3000, 7000])
  })

  it('strips ```json fences', () => {
    const content = '```json\n' + JSON.stringify(valid) + '\n```'
    expect(parseProposalContent(content)?.targetAllocBps).toEqual([3000, 7000])
  })

  it('strips bare ``` fences', () => {
    const content = '```\n' + JSON.stringify(valid) + '\n```'
    expect(parseProposalContent(content)?.regime).toBe('RISK_ON')
  })

  it('extracts JSON embedded in surrounding prose', () => {
    const content = `Here is my decision:\n${JSON.stringify(valid)}\nThanks!`
    expect(parseProposalContent(content)?.targetAllocBps).toEqual([3000, 7000])
  })

  it('returns null for non-JSON garbage', () => {
    expect(parseProposalContent('I refuse to answer in JSON.')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseProposalContent('')).toBeNull()
    expect(parseProposalContent('   ')).toBeNull()
  })

  it('returns null when JSON fails the ProposalSchema (bad regime)', () => {
    const bad = JSON.stringify({ ...valid, regime: 'YOLO' })
    expect(parseProposalContent(bad)).toBeNull()
  })

  it('returns null when bps are out of range', () => {
    const bad = JSON.stringify({ ...valid, targetAllocBps: [99_999, 1] })
    expect(parseProposalContent(bad)).toBeNull()
  })

  it('returns null on malformed JSON (unbalanced braces)', () => {
    expect(parseProposalContent('{"regime": "NEUTRAL", "targetAllocBps": [1,2]')).toBeNull()
  })
})
