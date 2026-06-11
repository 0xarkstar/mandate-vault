import { z } from 'zod'

/**
 * Perp funding feed. Primary source: Bybit v5 (Mantle's ecosystem exchange —
 * Bybit co-hosts the hackathon and anchors MNT liquidity). Fallback: Binance
 * USD-M. Both are real, keyless REST endpoints; the failover exists so a live
 * demo never stalls on a single venue outage.
 *
 *  Bybit:   /v5/market/funding/history?category=linear&symbol=…&limit=42
 *           /v5/market/tickers?category=linear&symbol=…
 *  Binance: /fapi/v1/fundingRate?symbol=…&limit=42
 *           /fapi/v1/premiumIndex?symbol=…
 *
 * All numeric fields are kept as decimal strings end-to-end so the snapshot is
 * byte-stable (no float reformatting between agent and verifier).
 */

const BYBIT_BASE = 'https://api.bybit.com'
const BINANCE_BASE = 'https://fapi.binance.com'
const FUNDING_HISTORY_LIMIT = 42 // ~14 days of 8h rates
const MEAN_WINDOW = 21 // last 21 rates ≈ 7 days
const TIMEOUT_MS = 10_000
const RETRIES = 2

// ---------------------------------------------------------------- schemas

const BybitFundingHistorySchema = z.object({
  retCode: z.number(),
  result: z.object({
    list: z.array(
      z.object({
        symbol: z.string(),
        fundingRate: z.string(),
        fundingRateTimestamp: z.string()
      })
    )
  })
})

const BybitTickerSchema = z.object({
  retCode: z.number(),
  result: z.object({
    list: z.array(
      z.object({
        symbol: z.string(),
        fundingRate: z.string(),
        markPrice: z.string()
      })
    )
  })
})

const BinanceFundingArraySchema = z.array(
  z.object({
    symbol: z.string(),
    fundingTime: z.number().int(),
    fundingRate: z.string()
  })
)

const BinancePremiumIndexSchema = z.object({
  symbol: z.string(),
  markPrice: z.string(),
  lastFundingRate: z.string()
})

export interface FundingSnapshot {
  lastRate: string
  mean7d: string
  markPrice: string
}

// ------------------------------------------------------------ pure helpers

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
  // 8 decimal places mirrors exchange funding-rate precision; trailing zeros
  // kept for byte-stability of the canonical snapshot.
  return (sum / recent.length).toFixed(8)
}

/** Build the FundingSnapshot from oldest→newest rates (pure). */
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

/** Parse raw Bybit v5 responses into a FundingSnapshot (pure). */
export function parseBybitFunding(rawHistory: unknown, rawTicker: unknown): FundingSnapshot {
  const history = BybitFundingHistorySchema.parse(rawHistory)
  const ticker = BybitTickerSchema.parse(rawTicker)
  if (history.retCode !== 0) throw new Error(`bybit funding history retCode ${history.retCode}`)
  if (ticker.retCode !== 0) throw new Error(`bybit ticker retCode ${ticker.retCode}`)
  const t = ticker.result.list[0]
  if (!t) throw new Error('bybit ticker list is empty')
  // Bybit returns newest-first; buildFundingSnapshot expects oldest→newest.
  const ratesOldestFirst = [...history.result.list].reverse().map((e) => e.fundingRate)
  return buildFundingSnapshot(ratesOldestFirst, t.fundingRate, t.markPrice)
}

/** Parse raw Binance responses into a FundingSnapshot (pure). */
export function parseBinanceFunding(rawHistory: unknown, rawPremium: unknown): FundingSnapshot {
  const history = BinanceFundingArraySchema.parse(rawHistory) // oldest→newest
  const premium = BinancePremiumIndexSchema.parse(rawPremium)
  return buildFundingSnapshot(
    history.map((h) => h.fundingRate),
    premium.lastFundingRate,
    premium.markPrice
  )
}

// ------------------------------------------------------------------- I/O

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

async function fetchFundingBybit(symbol: string): Promise<FundingSnapshot> {
  const q = encodeURIComponent(symbol)
  const [rawHistory, rawTicker] = await Promise.all([
    fetchJson(`${BYBIT_BASE}/v5/market/funding/history?category=linear&symbol=${q}&limit=${FUNDING_HISTORY_LIMIT}`),
    fetchJson(`${BYBIT_BASE}/v5/market/tickers?category=linear&symbol=${q}`)
  ])
  return parseBybitFunding(rawHistory, rawTicker)
}

async function fetchFundingBinance(symbol: string): Promise<FundingSnapshot> {
  const q = encodeURIComponent(symbol)
  const [rawHistory, rawPremium] = await Promise.all([
    fetchJson(`${BINANCE_BASE}/fapi/v1/fundingRate?symbol=${q}&limit=${FUNDING_HISTORY_LIMIT}`),
    fetchJson(`${BINANCE_BASE}/fapi/v1/premiumIndex?symbol=${q}`)
  ])
  return parseBinanceFunding(rawHistory, rawPremium)
}

/**
 * Fetch live funding data for `symbol` (default ETHUSDT): Bybit first,
 * Binance on failure. Both responses are zod-validated before use.
 */
export async function fetchFunding(symbol: string = 'ETHUSDT'): Promise<FundingSnapshot> {
  try {
    return await fetchFundingBybit(symbol)
  } catch {
    return fetchFundingBinance(symbol)
  }
}
