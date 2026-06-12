import { recoverTypedDataAddress, type Address } from 'viem'
import { QUOTE_TYPES, quoteDomain, SignedQuoteSchema, type QuoteRequest, type SignedQuote } from './types.js'

/**
 * Quote collection: fan a request out to MM bots, zod-validate the responses,
 * verify every EIP-712 signature off-chain, and drop anything invalid. A bad
 * or malicious MM response can therefore never reach routing.
 */

/** An MM counterparty the agent can request quotes from (in-process or HTTP). */
export interface MmClient {
  name: string
  address: Address
  requestQuote(req: QuoteRequest): Promise<SignedQuote>
}

export interface CollectOptions {
  venue: Address
  chainId: number
  /** Reject quotes expiring sooner than this many seconds from `nowSec`. */
  minTtlSec?: number
  nowSec?: number
}

/**
 * Collect quotes from all MMs for one leg. Failures and invalid signatures are
 * skipped (logged via the returned `rejected` list), never thrown — a single
 * broken MM must not block execution.
 */
export async function collectQuotes(
  mms: MmClient[],
  req: QuoteRequest,
  opts: CollectOptions
): Promise<{ valid: SignedQuote[]; rejected: string[] }> {
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000)
  const minTtl = opts.minTtlSec ?? 5

  const settled = await Promise.allSettled(mms.map((mm) => mm.requestQuote(req)))

  const valid: SignedQuote[] = []
  const rejected: string[] = []

  for (let i = 0; i < settled.length; i++) {
    const name = mms[i]!.name
    const res = settled[i]!
    if (res.status === 'rejected') {
      rejected.push(`${name}: request failed (${String(res.reason)})`)
      continue
    }
    const parsed = SignedQuoteSchema.safeParse(res.value)
    if (!parsed.success) {
      rejected.push(`${name}: schema mismatch`)
      continue
    }
    const sq = parsed.data as SignedQuote
    const q = sq.quote
    if (q.assetIn.toLowerCase() !== req.assetIn.toLowerCase() || q.assetOut.toLowerCase() !== req.assetOut.toLowerCase()) {
      rejected.push(`${name}: pair mismatch`)
      continue
    }
    if (q.amountIn < req.amountIn) {
      rejected.push(`${name}: quote size ${q.amountIn} < requested ${req.amountIn}`)
      continue
    }
    if (q.expiry < BigInt(nowSec + minTtl)) {
      rejected.push(`${name}: expires too soon`)
      continue
    }
    const signer = await recoverTypedDataAddress({
      domain: quoteDomain(opts.venue, opts.chainId),
      types: QUOTE_TYPES,
      primaryType: 'Quote',
      message: { ...q },
      signature: sq.signature
    }).catch(() => null)
    if (signer == null || signer.toLowerCase() !== q.mm.toLowerCase()) {
      rejected.push(`${name}: signature does not recover to mm address`)
      continue
    }
    valid.push(sq)
  }

  return { valid, rejected }
}
