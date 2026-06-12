import { describe, it, expect } from 'vitest'
import {
  extractSnapshotMeta,
  extractPlaybookVersion,
  extractLlmFallback
} from '../src/lib/snapshot-meta'

describe('extractPlaybookVersion', () => {
  it('parses a numeric playbookVersion', () => {
    expect(extractPlaybookVersion('{"playbookVersion":3}')).toBe(3)
    expect(extractPlaybookVersion('{"playbookVersion":0}')).toBe(0)
  })

  it('returns null when absent or non-numeric', () => {
    expect(extractPlaybookVersion('{}')).toBeNull()
    expect(extractPlaybookVersion('{"playbookVersion":"2"}')).toBeNull()
    expect(extractPlaybookVersion('not json')).toBeNull()
  })
})

describe('extractLlmFallback', () => {
  it('returns true only for an explicit boolean true', () => {
    expect(extractLlmFallback('{"llmFallback":true}')).toBe(true)
  })

  it('returns false when absent, false, or non-boolean', () => {
    expect(extractLlmFallback('{"llmFallback":false}')).toBe(false)
    expect(extractLlmFallback('{}')).toBe(false)
    expect(extractLlmFallback('{"llmFallback":"true"}')).toBe(false)
    expect(extractLlmFallback('broken')).toBe(false)
  })
})

describe('extractSnapshotMeta', () => {
  it('parses both fields together', () => {
    const meta = extractSnapshotMeta('{"playbookVersion":5,"llmFallback":true}')
    expect(meta).toEqual({ playbookVersion: 5, llmFallback: true })
  })

  it('degrades gracefully on an empty/old snapshot', () => {
    expect(extractSnapshotMeta('{}')).toEqual({ playbookVersion: null, llmFallback: false })
  })
})
