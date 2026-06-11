import { describe, it, expect } from 'vitest'
import {
  bpsToPct,
  bpsPerYearToPct,
  formatWad,
  formatUsd,
  shortenAddress,
  timeAgo,
  formatCooldown
} from '../src/lib/format'

describe('bpsToPct', () => {
  it('formats whole percents', () => {
    expect(bpsToPct(7000)).toBe('70%')
    expect(bpsToPct(10_000)).toBe('100%')
    expect(bpsToPct(0)).toBe('0%')
  })

  it('formats fractional percents', () => {
    expect(bpsToPct(2550)).toBe('25.5%')
    expect(bpsToPct(1)).toBe('0.01%')
    expect(bpsToPct(1500)).toBe('15%')
  })

  it('handles negative bps (clamp delta)', () => {
    expect(bpsToPct(-500)).toBe('-5%')
  })
})

describe('bpsPerYearToPct', () => {
  it('formats annual fee bps', () => {
    expect(bpsPerYearToPct(100)).toBe('1%')
    expect(bpsPerYearToPct(450)).toBe('4.5%')
  })
})

describe('formatWad', () => {
  it('formats a 1e18 bigint share price', () => {
    expect(formatWad(1_000000000000000000n)).toBe('1')
    expect(formatWad(1_050000000000000000n, 4)).toBe('1.05')
  })

  it('accepts decimal strings', () => {
    expect(formatWad('2500000000000000000', 2)).toBe('2.5')
  })

  it('returns an em dash for malformed input', () => {
    expect(formatWad('not-a-number')).toBe('—')
  })

  it('trims trailing zeros to requested precision', () => {
    expect(formatWad(1_100000000000000000n, 4)).toBe('1.1')
  })
})

describe('formatUsd', () => {
  it('groups thousands with two cents', () => {
    expect(formatUsd(12_345_670000000000000000n)).toBe('$12,345.67')
  })

  it('handles sub-dollar values', () => {
    expect(formatUsd(990000000000000000n)).toBe('$0.99')
  })

  it('handles zero', () => {
    expect(formatUsd(0n)).toBe('$0.00')
  })
})

describe('shortenAddress', () => {
  it('truncates a 0x address', () => {
    expect(shortenAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678')
  })

  it('leaves short strings intact', () => {
    expect(shortenAddress('0x12')).toBe('0x12')
  })
})

describe('timeAgo', () => {
  const now = 1_000_000 * 1000 // ms
  it('formats seconds/minutes/hours/days', () => {
    expect(timeAgo(1_000_000 - 30, now)).toBe('30s ago')
    expect(timeAgo(1_000_000 - 120, now)).toBe('2m ago')
    expect(timeAgo(1_000_000 - 7200, now)).toBe('2h ago')
    expect(timeAgo(1_000_000 - 172800, now)).toBe('2d ago')
  })

  it('returns em dash for null', () => {
    expect(timeAgo(null, now)).toBe('—')
  })
})

describe('formatCooldown', () => {
  it('formats common durations', () => {
    expect(formatCooldown(3600)).toBe('1h')
    expect(formatCooldown(86400)).toBe('1d')
    expect(formatCooldown(300)).toBe('5m')
    expect(formatCooldown(45)).toBe('45s')
  })
})
