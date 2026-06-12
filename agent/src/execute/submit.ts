import type { Address } from 'viem'
import { parseAbiItem, parseEventLogs, type TransactionReceipt } from 'viem'
import { rfqVenueAbi } from '@mandate-vault/abi'
import type { Clients } from '../chain.js'
import type { VaultState } from '../feeds/vault.js'
import { computeLegs } from './legs.js'
import { collectQuotes, type MmClient } from './rfq.js'
import { selectBest, slippageGate } from './route.js'
import type { Leg, SignedQuote } from './types.js'

/**
 * RFQ execution pipeline for one rebalance: compute the exact swap legs the
 * vault will execute, collect signed quotes per leg, pick the best, gate on
 * slippage, and post the winning quotes on-chain so the vault's rebalance()
 * consumes them. Deterministic end to end — the on-chain mandate re-check
 * remains the final backstop.
 */

export const QUOTE_FILLED_EVENT = parseAbiItem(
  'event QuoteFilled(address indexed mm, address indexed assetIn, address indexed assetOut, uint256 amountIn, uint256 amountOut, uint256 oracleMidOut, int256 improvementBps)'
)

export interface RfqConfig {
  venue: Address
  mms: MmClient[]
  maxSlippageBps: number
}

export interface LegPlan {
  leg: Leg
  /** Best valid quote, or null when every MM failed (venue falls back to mid). */
  pick: SignedQuote | null
  slippageBps: number
  rejected: string[]
}

export type RfqPlanResult =
  | { action: 'proceed'; plans: LegPlan[] }
  | { action: 'freeze'; reason: string; plans: LegPlan[] }

/** Plan the legs + quotes for a target allocation. Pure I/O against MMs only. */
export async function planRfqExecution(
  rfq: RfqConfig,
  chainId: number,
  vaultState: VaultState,
  targetBps: number[]
): Promise<RfqPlanResult> {
  const legs = computeLegs({
    assets: vaultState.mandate.assets,
    balances: vaultState.balances,
    prices: vaultState.prices,
    totalValue: vaultState.totalValue,
    targetBps
  })

  const plans: LegPlan[] = []
  for (const leg of legs) {
    const priceIn = vaultState.prices[leg.assetIn.toLowerCase()]!
    const priceOut = vaultState.prices[leg.assetOut.toLowerCase()]!
    const { valid, rejected } = await collectQuotes(
      rfq.mms,
      { assetIn: leg.assetIn, assetOut: leg.assetOut, amountIn: leg.amountIn, priceIn, priceOut },
      { venue: rfq.venue, chainId }
    )
    const best = selectBest(valid)
    if (best == null) {
      // No usable quote — the venue's oracle-mid fallback covers this leg.
      plans.push({ leg, pick: null, slippageBps: 0, rejected })
      continue
    }
    // Gate against the mid for the QUOTED size (quotes may carry headroom).
    const quotedMid = (best.quote.amountIn * priceIn) / priceOut
    const gate = slippageGate(best, quotedMid, rfq.maxSlippageBps)
    if (gate.action === 'freeze') {
      return { action: 'freeze', reason: gate.reason, plans }
    }
    plans.push({ leg, pick: best, slippageBps: gate.slippageBps, rejected })
  }

  return { action: 'proceed', plans }
}

/** Post every picked quote on-chain (one tx each; the venue stores per-pair). */
export async function postPickedQuotes(clients: Clients, venue: Address, plans: LegPlan[]): Promise<`0x${string}`[]> {
  const hashes: `0x${string}`[] = []
  for (const plan of plans) {
    if (plan.pick == null) continue
    const { quote, signature } = plan.pick
    const hash = await clients.walletClient.writeContract({
      address: venue,
      abi: rfqVenueAbi,
      functionName: 'postQuote',
      args: [quote, signature],
      chain: clients.chain,
      account: clients.account
    })
    await clients.publicClient.waitForTransactionReceipt({ hash })
    hashes.push(hash)
  }
  return hashes
}

export interface Fill {
  mm: Address
  assetIn: Address
  assetOut: Address
  amountIn: bigint
  amountOut: bigint
  oracleMidOut: bigint
  improvementBps: number
}

/** Extract TCA fills (QuoteFilled events) from a rebalance receipt. */
export function parseFills(receipt: TransactionReceipt): Fill[] {
  const events = parseEventLogs({ abi: [QUOTE_FILLED_EVENT], logs: receipt.logs })
  return events.map((e) => ({
    mm: e.args.mm,
    assetIn: e.args.assetIn,
    assetOut: e.args.assetOut,
    amountIn: e.args.amountIn,
    amountOut: e.args.amountOut,
    oracleMidOut: e.args.oracleMidOut,
    improvementBps: Number(e.args.improvementBps)
  }))
}
