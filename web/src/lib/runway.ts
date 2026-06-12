/**
 * Runway = how many months a vault's safe sleeve covers a stated monthly burn.
 * Inputs are 1e18-scaled mUSD bigints (safe-asset value) and a human-entered
 * monthly burn in mUSD. Pure arithmetic — no chain reads.
 */

export interface Runway {
  /** Months of runway, or null when burn is zero/invalid (∞ runway). */
  months: number | null
  /** Human label, e.g. "≈ 14.2 months" or "∞ (no burn set)". */
  label: string
}

const WAD = 10n ** 18n

/**
 * Compute runway from a safe-sleeve value (1e18 mUSD) and a monthly burn string
 * (plain mUSD, e.g. "5000"). A non-positive or unparseable burn yields infinite
 * runway. Result months are rounded to one decimal.
 */
export function computeRunway(safeSleeveWad: bigint, monthlyBurn: string): Runway {
  const burn = parseBurn(monthlyBurn)
  if (burn <= 0) {
    return { months: null, label: '∞ (no burn set)' }
  }
  // Scale the burn to 1e18 then divide as a ratio with one-decimal precision.
  const burnWad = BigInt(Math.round(burn * 1e6)) * (WAD / 1_000_000n)
  if (burnWad === 0n) return { months: null, label: '∞ (no burn set)' }
  const tenths = (safeSleeveWad * 10n) / burnWad
  const months = Number(tenths) / 10
  return { months, label: `≈ ${trim(months)} months` }
}

/** Parse a monthly-burn string into a non-negative number; 0 on failure. */
export function parseBurn(input: string): number {
  const n = Number(input.trim())
  return Number.isFinite(n) && n > 0 ? n : 0
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
