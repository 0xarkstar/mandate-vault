import { describe, expect, it } from 'vitest'
import { parseForceTarget } from '../src/main.js'

describe('parseForceTarget', () => {
  it('parses a comma-separated bps list', () => {
    expect(parseForceTarget('3000,6500,500')).toEqual([3000, 6500, 500])
  })

  it('returns undefined when absent', () => {
    expect(parseForceTarget(undefined)).toBeUndefined()
  })

  it('parses a single value', () => {
    expect(parseForceTarget('10000')).toEqual([10_000])
  })
})
