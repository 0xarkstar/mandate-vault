import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { collectQuotes, type MmClient } from '../src/execute/rfq.js'
import { makeDemoMm } from '../src/mm/demo-mm.js'
import type { QuoteRequest, SignedQuote } from '../src/execute/types.js'

/**
 * Offline RFQ round-trip: demo MMs sign EIP-712 quotes, collectQuotes verifies
 * the signatures and validation rules. No network, no chain.
 */

const WAD = 10n ** 18n
const VENUE = '0x00000000000000000000000000000000000000fe' as Address
const CHAIN_ID = 31_337

// anvil well-known-style throwaway keys are auto-redacted by tooling; use
// arbitrary fixed test vectors instead (never funded anywhere).
const KEY_A = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const
const KEY_B = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as const

const REQ: QuoteRequest = {
  assetIn: '0x0000000000000000000000000000000000000001' as Address,
  assetOut: '0x0000000000000000000000000000000000000002' as Address,
  amountIn: 1650n * WAD,
  priceIn: WAD,
  priceOut: 1650n * WAD
}

function tightAndWide(): MmClient[] {
  let nonce = 0n
  const nonceFn = (): bigint => ++nonce
  return [
    makeDemoMm({ name: 'tight', privateKey: KEY_A, edgeBps: 5, venue: VENUE, chainId: CHAIN_ID, nonceFn }),
    makeDemoMm({ name: 'wide', privateKey: KEY_B, edgeBps: -40, venue: VENUE, chainId: CHAIN_ID, nonceFn })
  ]
}

describe('demo MM + collectQuotes round-trip', () => {
  it('collects and verifies both demo quotes', async () => {
    const { valid, rejected } = await collectQuotes(tightAndWide(), REQ, { venue: VENUE, chainId: CHAIN_ID })
    expect(rejected).toEqual([])
    expect(valid).toHaveLength(2)
    // mid for 1650 in at 1:1650 = 1.0 out; tight = +5bps, wide = −40bps
    const tight = valid.find((q) => q.mmName === 'tight')!
    const wide = valid.find((q) => q.mmName === 'wide')!
    expect(tight.quote.amountOut).toBe((WAD * 10_005n) / 10_000n)
    expect(wide.quote.amountOut).toBe((WAD * 9_960n) / 10_000n)
  })

  it('rejects a quote whose signature does not match its mm address', async () => {
    const [tight] = tightAndWide()
    const forged: MmClient = {
      name: 'forged',
      address: tight!.address,
      async requestQuote(req: QuoteRequest): Promise<SignedQuote> {
        const real = await tight!.requestQuote(req)
        // tamper: claim a different mm than the actual signer
        return {
          ...real,
          quote: { ...real.quote, mm: '0x00000000000000000000000000000000000000bb' as Address }
        }
      }
    }
    const { valid, rejected } = await collectQuotes([forged], REQ, { venue: VENUE, chainId: CHAIN_ID })
    expect(valid).toHaveLength(0)
    expect(rejected[0]).toContain('signature')
  })

  it('rejects quotes for the wrong pair', async () => {
    const [tight] = tightAndWide()
    const wrongPair: MmClient = {
      name: 'wrong-pair',
      address: tight!.address,
      async requestQuote(req: QuoteRequest): Promise<SignedQuote> {
        return tight!.requestQuote({ ...req, assetIn: req.assetOut, assetOut: req.assetIn })
      }
    }
    const { valid, rejected } = await collectQuotes([wrongPair], REQ, { venue: VENUE, chainId: CHAIN_ID })
    expect(valid).toHaveLength(0)
    expect(rejected[0]).toContain('pair mismatch')
  })

  it('rejects undersized quotes', async () => {
    const [tight] = tightAndWide()
    const small: MmClient = {
      name: 'small',
      address: tight!.address,
      async requestQuote(req: QuoteRequest): Promise<SignedQuote> {
        return tight!.requestQuote({ ...req, amountIn: req.amountIn / 2n })
      }
    }
    const { valid, rejected } = await collectQuotes([small], REQ, { venue: VENUE, chainId: CHAIN_ID })
    expect(valid).toHaveLength(0)
    expect(rejected[0]).toContain('quote size')
  })

  it('skips a throwing MM without blocking the others', async () => {
    const broken: MmClient = {
      name: 'broken',
      address: '0x00000000000000000000000000000000000000cc' as Address,
      requestQuote(): Promise<SignedQuote> {
        return Promise.reject(new Error('mm down'))
      }
    }
    const { valid, rejected } = await collectQuotes([broken, ...tightAndWide()], REQ, {
      venue: VENUE,
      chainId: CHAIN_ID
    })
    expect(valid).toHaveLength(2)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toContain('request failed')
  })

  it('rejects quotes that expire too soon', async () => {
    let nonce = 100n
    const stale = makeDemoMm({
      name: 'stale',
      privateKey: KEY_A,
      edgeBps: 5,
      venue: VENUE,
      chainId: CHAIN_ID,
      ttlSec: 1,
      nonceFn: () => ++nonce
    })
    const { valid, rejected } = await collectQuotes([stale], REQ, {
      venue: VENUE,
      chainId: CHAIN_ID,
      minTtlSec: 30
    })
    expect(valid).toHaveLength(0)
    expect(rejected[0]).toContain('expires too soon')
  })
})
