import { describe, it, expect } from 'vitest'
import { deriveVaultName, templateTagline, templateSublabel } from '../src/lib/vault-name'

const A = '0x0000000000000000000000000000000000000001' as const
const B = '0x0000000000000000000000000000000000000002' as const
const C = '0x0000000000000000000000000000000000000003' as const

describe('deriveVaultName', () => {
  it('classifies a 2-asset 70% safe-min mandate as Conservative', () => {
    expect(deriveVaultName({ assets: [A, B], minBps: [7000, 0] })).toBe('Conservative')
  })

  it('classifies a 2-asset 30% safe-min mandate as Balanced', () => {
    expect(deriveVaultName({ assets: [A, B], minBps: [3000, 0] })).toBe('Balanced')
  })

  it('classifies any 3-asset mandate as Aggressive', () => {
    expect(deriveVaultName({ assets: [A, B, C], minBps: [2000, 0, 0] })).toBe('Aggressive')
  })

  it('falls back to Custom Mandate for a 2-asset non-template min', () => {
    expect(deriveVaultName({ assets: [A, B], minBps: [5000, 0] })).toBe('Custom Mandate')
  })

  it('falls back to Custom Mandate for a single-asset mandate (edge)', () => {
    expect(deriveVaultName({ assets: [A], minBps: [10_000] })).toBe('Custom Mandate')
  })

  it('falls back to Custom Mandate for 4+ assets (edge)', () => {
    expect(deriveVaultName({ assets: [A, B, C, A], minBps: [2500, 0, 0, 0] })).toBe('Custom Mandate')
  })

  it('every template has a non-empty tagline', () => {
    for (const t of ['Conservative', 'Balanced', 'Aggressive', 'Custom Mandate'] as const) {
      expect(templateTagline(t).length).toBeGreaterThan(0)
    }
  })
})

describe('templateSublabel', () => {
  it('frames each preset template as a treasury use-case', () => {
    expect(templateSublabel('Conservative')).toBe('Emergency fund floor')
    expect(templateSublabel('Balanced')).toBe('Treasury working capital')
    expect(templateSublabel('Aggressive')).toBe('Growth sleeve')
  })

  it('has no sublabel for a custom mandate', () => {
    expect(templateSublabel('Custom Mandate')).toBeNull()
  })
})
