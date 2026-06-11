import type { Mandate } from './types'

export type VaultTemplate = 'Conservative' | 'Balanced' | 'Aggressive' | 'Custom Mandate'

/**
 * Derive a human-friendly template name from a mandate's shape. This mirrors
 * the factory's preset templates so vaults read like a robo-advisor product:
 *  - 2-asset, safe-asset min 70% → Conservative
 *  - 2-asset, safe-asset min 30% → Balanced
 *  - 3-asset                     → Aggressive
 *  - anything else               → Custom Mandate
 *
 * Pure function over the mandate — no chain reads.
 */
export function deriveVaultName(mandate: Pick<Mandate, 'assets' | 'minBps'>): VaultTemplate {
  const n = mandate.assets.length
  const safeMin = mandate.minBps[0]

  if (n === 2) {
    if (safeMin === 7000) return 'Conservative'
    if (safeMin === 3000) return 'Balanced'
    return 'Custom Mandate'
  }
  if (n === 3) return 'Aggressive'
  return 'Custom Mandate'
}

/** A short tagline per template, for card subtitles. */
export function templateTagline(template: VaultTemplate): string {
  switch (template) {
    case 'Conservative':
      return 'Capital-preservation mandate · safe-asset heavy'
    case 'Balanced':
      return 'Measured carry mandate · diversified sleeves'
    case 'Aggressive':
      return 'Growth mandate · 3-asset, MNT treasury sleeve'
    case 'Custom Mandate':
      return 'Institutional custom IPS'
  }
}
