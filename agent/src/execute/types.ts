import { z } from 'zod'
import type { Address, Hex } from 'viem'

/**
 * Typed contracts of the EXECUTION engine. No LLM ever touches these paths —
 * everything here is deterministic arithmetic and signature plumbing.
 */

/** Mirrors RFQVenue.Quote (EIP-712 struct). */
export interface Quote {
  assetIn: Address
  assetOut: Address
  amountIn: bigint
  amountOut: bigint
  expiry: bigint
  mm: Address
  nonce: bigint
}

export interface SignedQuote {
  quote: Quote
  signature: Hex
  /** Display label for logs / TCA (e.g. "demo-mm-tight"). */
  mmName: string
}

const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/) as unknown as z.ZodType<Address>

/** External-input validation for quotes coming back from MM bots. */
export const SignedQuoteSchema = z.object({
  quote: z.object({
    assetIn: hexAddress,
    assetOut: hexAddress,
    amountIn: z.bigint().positive(),
    amountOut: z.bigint().positive(),
    expiry: z.bigint().positive(),
    mm: hexAddress,
    nonce: z.bigint().nonnegative()
  }),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/) as unknown as z.ZodType<Hex>,
  mmName: z.string().min(1)
})

/** A quote request the agent sends to MM bots — one per rebalance leg. */
export interface QuoteRequest {
  assetIn: Address
  assetOut: Address
  amountIn: bigint
  /** Oracle mid prices (1e18) so a pure MM can price off a shared reference. */
  priceIn: bigint
  priceOut: bigint
}

/** One swap leg the vault will execute during rebalance (sell or buy). */
export interface Leg {
  assetIn: Address
  assetOut: Address
  amountIn: bigint
  /** Oracle-mid output for TCA / slippage gating. */
  midOut: bigint
}

/** EIP-712 typed-data pieces shared by the MM signer and the agent verifier. */
export const QUOTE_TYPES = {
  Quote: [
    { name: 'assetIn', type: 'address' },
    { name: 'assetOut', type: 'address' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'amountOut', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'mm', type: 'address' },
    { name: 'nonce', type: 'uint256' }
  ]
} as const

export function quoteDomain(venue: Address, chainId: number) {
  return {
    name: 'MandateVault RFQ',
    version: '1',
    chainId,
    verifyingContract: venue
  } as const
}
