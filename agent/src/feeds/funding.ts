import { z } from 'zod'

/**
 * Binance USD-M futures funding feed. Real, keyless REST endpoints:
 *  - /fapi/v1/fundingRate?symbol=…&limit=42  → historical 8h funding rates
 *  - /fapi/v1/premiumIndex?symbol=…          → current mark price + last rate
 *
 * All numeric fields are kept as decimal strings end-to-end so the snapshot is
 * byte-stable (no float reformatting between agent and verifier).
 */

const FUNDING_BASE = 'https://fapi.binance.com'
const FUNDING_HISTORY_LIMIT = 42 // ~14 days of 8h rates
const MEAN_WINDOW = 21 // last 21 rates ≈ 7 days
const TIMEOUT_MS = 10_000
const RETRIES = 2

const FundingRateEntrySchema = z.object({
  symbol: z.string(),
  fundingTime: z.number().int(),
  fundingRate: z.string()
})
const FundingRateArraySchema = z.array(FundingRateEntrySchema)

const PremiumIndexSchema = z.object({
  symbol: z.string(),
  markPrice: z.string(),
  lastFundingRate: z.string()
})

export interface FundingSnapshot {
  lastRate: string
  mean7d: string
  markPrice: string
}

/**
 * Mean of the last `window` funding rates, returned as a fixed-precision
 * decimal string. Pure — no network — so it is unit-testable.
 */
export function computeMean(rates: readonly string[], window: number = MEAN_WINDOW): string {
  const recent = rates.slice(-window)
  if (recent.length === 0) return '0'
  let sum = 0
  for (const r of recent) {
    const n = Number(r)
    if (!Number.isFinite(n)) throw new Error(`non-numeric funding rate: ${r}`)
    sum += n
  }
  // 8 decimal places mirrors Binance funding-rate precision; trailing zeros kept
  // for byte-stability of the canonical snapshot.
  return (sum / recent.length).toFixed(8)
}

/** Build the FundingSnapshot from already-fetched raw responses (pure). */
export function buildFundingSnapshot(
  history: readonly string[],
  lastFundingRate: string,
  markPrice: string
): FundingSnapshot {
  const lastRate = history.length > 0 ? history[history.length - 1]! : lastFundingRate
  return {
    lastRate,
    mean7d: computeMean(history),
    markPrice
  }
}

async function fetchJson(url: string): Promise<unknown> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return await res.json()
    } catch (err) {
      lastErr = err
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`funding feed request failed after ${RETRIES + 1} attempts: ${String(lastErr)}`)
}

/**
 * Fetch live funding data for `symbol` (default ETHUSDT) and assemble the
 * FundingSnapshot. Validates both responses with zod before use.
 */
export async function fetchFunding(symbol: string = 'ETHUSDT'): Promise<FundingSnapshot> {
  const historyUrl = `${FUNDING_BASE}/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=${FUNDING_HISTORY_LIMIT}`
  const premiumUrl = `${FUNDING_BASE}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`

  const [rawHistory, rawPremium] = await Promise.all([fetchJson(historyUrl), fetchJson(premiumUrl)])

  const history = FundingRateArraySchema.parse(rawHistory)
  const premium = PremiumIndexSchema.parse(rawPremium)

  return buildFundingSnapshot(
    history.map((h) => h.fundingRate),
    premium.lastFundingRate,
    premium.markPrice
  )
}
