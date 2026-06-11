import { formatUnits } from 'viem'

/**
 * Format a bps integer (0–10000) as a percentage string.
 * 7000 → "70%", 2550 → "25.5%", 1 → "0.01%".
 */
export function bpsToPct(bps: number, maxFractionDigits = 2): string {
  const pct = bps / 100
  const rounded = roundTo(pct, maxFractionDigits)
  return `${trimFloat(rounded)}%`
}

/**
 * Per-year bps as an annual percent, e.g. management fee 100 → "1%/yr".
 */
export function bpsPerYearToPct(bps: number): string {
  return `${trimFloat(roundTo(bps / 100, 2))}%`
}

/**
 * Format a 1e18 fixed-point value (bigint or decimal string) to a human number
 * with `decimals` fractional digits. Defaults to 18-decimal scaling.
 */
export function formatWad(value: bigint | string, displayDecimals = 4, scaleDecimals = 18): string {
  const asBig = typeof value === 'bigint' ? value : safeBigInt(value)
  if (asBig === null) return '—'
  const full = formatUnits(asBig, scaleDecimals)
  return trimToDecimals(full, displayDecimals)
}

/**
 * Format a USD value (1e18) as a currency-ish string, e.g. "$12,345.67".
 */
export function formatUsd(value: bigint | string, scaleDecimals = 18): string {
  const asBig = typeof value === 'bigint' ? value : safeBigInt(value)
  if (asBig === null) return '—'
  const full = formatUnits(asBig, scaleDecimals)
  const [intPart, fracPart = ''] = full.split('.')
  const grouped = groupThousands(intPart ?? '0')
  const cents = (fracPart + '00').slice(0, 2)
  return `$${grouped}.${cents}`
}

/** Truncate an address to 0x1234…abcd. */
export function shortenAddress(addr: string, lead = 6, tail = 4): string {
  if (addr.length <= lead + tail) return addr
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`
}

/** Relative time like "3m ago" / "2h ago" from a unix-seconds timestamp. */
export function timeAgo(tsSeconds: number | null, nowMs = Date.now()): string {
  if (tsSeconds === null) return '—'
  const diff = Math.max(0, Math.floor(nowMs / 1000) - tsSeconds)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** Format a cooldown duration in seconds as a compact label. */
export function formatCooldown(seconds: number): string {
  if (seconds % 86400 === 0 && seconds >= 86400) return `${seconds / 86400}d`
  if (seconds % 3600 === 0 && seconds >= 3600) return `${seconds / 3600}h`
  if (seconds % 60 === 0 && seconds >= 60) return `${seconds / 60}m`
  return `${seconds}s`
}

// ---------------------------------------------------------------- internals

function roundTo(n: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function trimFloat(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n)
}

function trimToDecimals(value: string, decimals: number): string {
  if (!value.includes('.')) return value
  const [intPart, fracPart] = value.split('.')
  if (decimals === 0) return intPart ?? '0'
  const trimmed = (fracPart ?? '').slice(0, decimals).replace(/0+$/, '')
  return trimmed.length > 0 ? `${intPart}.${trimmed}` : (intPart ?? '0')
}

function groupThousands(intPart: string): string {
  const neg = intPart.startsWith('-')
  const digits = neg ? intPart.slice(1) : intPart
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return neg ? `-${grouped}` : grouped
}

function safeBigInt(s: string): bigint | null {
  try {
    return BigInt(s)
  } catch {
    return null
  }
}
