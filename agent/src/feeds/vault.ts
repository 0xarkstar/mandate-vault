import type { Address, PublicClient } from 'viem'
import { mandateVaultAbi, mockOracleAbi } from '@mandate-vault/abi'

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

  const [rawMandate, rawAlloc, sharePrice, hwm, tripped, epoch] = (await Promise.all([
    publicClient.readContract({ ...base, functionName: 'mandate' }),
    publicClient.readContract({ ...base, functionName: 'currentAllocationBps' }),
    publicClient.readContract({ ...base, functionName: 'sharePrice' }),
    publicClient.readContract({ ...base, functionName: 'hwmSharePrice' }),
    publicClient.readContract({ ...base, functionName: 'tripped' }),
    publicClient.readContract({ ...base, functionName: 'epoch' })
  ])) as [RawMandate, readonly number[], bigint, bigint, boolean, bigint]

  const mandate = normalizeMandate(rawMandate)

  const priceResults = (await Promise.all(
    mandate.assets.map((asset) =>
      publicClient.readContract({
        address: oracle,
        abi: mockOracleAbi,
        functionName: 'price',
        args: [asset]
      })
    )
  )) as bigint[]

  const prices: Record<string, bigint> = {}
  mandate.assets.forEach((asset, i) => {
    prices[asset.toLowerCase()] = priceResults[i]!
  })

  return {
    mandate,
    allocBps: rawAlloc.map(Number),
    sharePrice,
    hwm,
    tripped,
    epoch,
    prices
  }
}
