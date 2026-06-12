import type { Address, PublicClient } from 'viem'
import { mandateVaultAbi, mockOracleAbi, mockErc20Abi } from '@mandate-vault/abi'

/**
 * On-chain reads for the agent: the mandate (bounds + assets), live allocation,
 * share price / HWM, trip flag, epoch and per-asset oracle prices.
 */

export interface MandateView {
  assets: Address[]
  minBps: number[]
  maxBps: number[]
  maxDrawdownBps: number
  rebalanceCooldown: number
  agent: Address
}

export interface VaultState {
  mandate: MandateView
  allocBps: number[]
  sharePrice: bigint
  hwm: bigint
  tripped: boolean
  epoch: bigint
  /** Oracle price per asset (1e18), keyed by lowercase asset address. */
  prices: Record<string, bigint>
  /** Raw token balance per asset, keyed by lowercase asset address. The RFQ
   * leg computation replicates the contract's integer math on these exact
   * values, so off-chain legs match on-chain swap amounts. */
  balances: Record<string, bigint>
  /** Total vault value in USD (1e18) — same read the contract uses. */
  totalValue: bigint
}

type RawMandate = {
  assets: readonly Address[]
  minBps: readonly number[]
  maxBps: readonly number[]
  maxDrawdownBps: number
  rebalanceCooldown: number
  mgmtFeeBpsPerYear: number
  perfFeeBps: number
  hurdleBpsPerYear: number
  agent: Address
}

function normalizeMandate(m: RawMandate): MandateView {
  return {
    assets: [...m.assets],
    minBps: m.minBps.map(Number),
    maxBps: m.maxBps.map(Number),
    maxDrawdownBps: Number(m.maxDrawdownBps),
    rebalanceCooldown: Number(m.rebalanceCooldown),
    agent: m.agent
  }
}

/** Read the full vault state needed to assemble a snapshot. */
export async function readVaultState(
  publicClient: PublicClient,
  vault: Address,
  oracle: Address
): Promise<VaultState> {
  const base = { address: vault, abi: mandateVaultAbi } as const

  const [rawMandate, rawAlloc, sharePrice, hwm, tripped, epoch, totalValue] = (await Promise.all([
    publicClient.readContract({ ...base, functionName: 'mandate' }),
    publicClient.readContract({ ...base, functionName: 'currentAllocationBps' }),
    publicClient.readContract({ ...base, functionName: 'sharePrice' }),
    publicClient.readContract({ ...base, functionName: 'hwmSharePrice' }),
    publicClient.readContract({ ...base, functionName: 'tripped' }),
    publicClient.readContract({ ...base, functionName: 'epoch' }),
    publicClient.readContract({ ...base, functionName: 'totalValue' })
  ])) as [RawMandate, readonly number[], bigint, bigint, boolean, bigint, bigint]

  const mandate = normalizeMandate(rawMandate)

  const [priceResults, balanceResults] = await Promise.all([
    Promise.all(
      mandate.assets.map((asset) =>
        publicClient.readContract({
          address: oracle,
          abi: mockOracleAbi,
          functionName: 'price',
          args: [asset]
        })
      )
    ) as Promise<bigint[]>,
    Promise.all(
      mandate.assets.map((asset) =>
        publicClient.readContract({
          address: asset,
          abi: mockErc20Abi,
          functionName: 'balanceOf',
          args: [vault]
        })
      )
    ) as Promise<bigint[]>
  ])

  const prices: Record<string, bigint> = {}
  const balances: Record<string, bigint> = {}
  mandate.assets.forEach((asset, i) => {
    prices[asset.toLowerCase()] = priceResults[i]!
    balances[asset.toLowerCase()] = balanceResults[i]!
  })

  return {
    mandate,
    allocBps: rawAlloc.map(Number),
    sharePrice,
    hwm,
    tripped,
    epoch,
    prices,
    balances,
    totalValue
  }
}
