import { randomBytes } from 'node:crypto'
import { privateKeyToAccount } from 'viem/accounts'
import type { Address } from 'viem'
import { QUOTE_TYPES, quoteDomain, type Quote, type QuoteRequest, type SignedQuote } from '../execute/types.js'
import type { MmClient } from '../execute/rfq.js'

/**
 * DEMO market-maker bots (ours, clearly labeled — see README honesty note).
 * Each prices off the shared oracle mid with a fixed edge: a positive edge
 * quotes BETTER than mid (a live MM pricing off fresher Bybit marks than the
 * on-chain oracle), a negative edge quotes worse. Two of these with different
 * edges let the vault demonstrably pick the better quote and record the
 * improvement on-chain (TCA).
 */

const BPS = 10_000n

export interface DemoMmOptions {
  name: string
  privateKey: `0x${string}`
  /** Signed edge vs oracle mid in bps: +5 = 5bps better than mid, -40 = worse. */
  edgeBps: number
  venue: Address
  chainId: number
  /** Quote time-to-live in seconds (default 120). */
  ttlSec?: number
  /** Injectable for deterministic tests. */
  nonceFn?: () => bigint
  nowSec?: () => number
}

function randomNonce(): bigint {
  return BigInt(`0x${randomBytes(16).toString('hex')}`)
}

export function makeDemoMm(opts: DemoMmOptions): MmClient {
  const account = privateKeyToAccount(opts.privateKey)
  const ttl = opts.ttlSec ?? 120
  const nextNonce = opts.nonceFn ?? randomNonce
  const now = opts.nowSec ?? ((): number => Math.floor(Date.now() / 1000))

  return {
    name: opts.name,
    address: account.address,
    async requestQuote(req: QuoteRequest): Promise<SignedQuote> {
      const midOut = (req.amountIn * req.priceIn) / req.priceOut
      const amountOut = (midOut * (BPS + BigInt(opts.edgeBps))) / BPS
      const quote: Quote = {
        assetIn: req.assetIn,
        assetOut: req.assetOut,
        amountIn: req.amountIn,
        amountOut,
        expiry: BigInt(now() + ttl),
        mm: account.address,
        nonce: nextNonce()
      }
      const signature = await account.signTypedData({
        domain: quoteDomain(opts.venue, opts.chainId),
        types: QUOTE_TYPES,
        primaryType: 'Quote',
        message: { ...quote }
      })
      return { quote, signature, mmName: opts.name }
    }
  }
}
