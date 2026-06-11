import { mandateVaultAbi, vaultFactoryAbi, mockErc20Abi } from '@mandate-vault/abi'
import { publicClient } from './clients'
import type { Mandate, VaultState } from '../lib/types'

const vaultAbi = mandateVaultAbi as never
const factoryAbi = vaultFactoryAbi as never
const erc20Abi = mockErc20Abi as never

/** Fetch the factory's vault registry. */
export async function fetchAllVaults(factory: `0x${string}`): Promise<`0x${string}`[]> {
  const result = (await publicClient.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: 'allVaults'
  })) as readonly `0x${string}`[]
  return [...result]
}

interface RawMandate {
  assets: readonly `0x${string}`[]
  minBps: readonly number[]
  maxBps: readonly number[]
  maxDrawdownBps: number
  rebalanceCooldown: number
  mgmtFeeBpsPerYear: number
  perfFeeBps: number
  hurdleBpsPerYear: number
  agent: `0x${string}`
}

function normalizeMandate(raw: RawMandate): Mandate {
  return {
    assets: [...raw.assets],
    minBps: raw.minBps.map(Number),
    maxBps: raw.maxBps.map(Number),
    maxDrawdownBps: Number(raw.maxDrawdownBps),
    rebalanceCooldown: Number(raw.rebalanceCooldown),
    mgmtFeeBpsPerYear: Number(raw.mgmtFeeBpsPerYear),
    perfFeeBps: Number(raw.perfFeeBps),
    hurdleBpsPerYear: Number(raw.hurdleBpsPerYear),
    agent: raw.agent
  }
}

/**
 * Read the full state of a single vault. Plain parallel reads (no multicall3
 * dependency — local anvil chains don't have the canonical deployment).
 */
export async function fetchVaultState(address: `0x${string}`): Promise<VaultState> {
  const read = (functionName: string) =>
    publicClient.readContract({ address, abi: vaultAbi, functionName } as never)

  const results = await Promise.all([
    read('mandate'),
    read('currentAllocationBps'),
    read('sharePrice'),
    read('hwmSharePrice'),
    read('totalValue'),
    read('totalShares'),
    read('tripped'),
    read('killed'),
    read('epoch'),
    read('lastRebalance')
  ])

  const [
    rawMandate,
    alloc,
    sharePrice,
    hwm,
    totalValue,
    totalShares,
    tripped,
    killed,
    epoch,
    lastRebalance
  ] = results as unknown as [
    RawMandate,
    readonly number[],
    bigint,
    bigint,
    bigint,
    bigint,
    boolean,
    boolean,
    bigint,
    bigint
  ]

  return {
    address,
    mandate: normalizeMandate(rawMandate),
    currentAllocationBps: alloc.map(Number),
    sharePrice,
    hwmSharePrice: hwm,
    totalValue,
    totalShares,
    tripped,
    killed,
    epoch: Number(epoch),
    lastRebalance: Number(lastRebalance)
  }
}

/** ERC20 metadata for one asset (symbol/decimals), tolerant of missing data. */
export async function fetchTokenMeta(token: `0x${string}`): Promise<{ symbol: string; decimals: number }> {
  try {
    const [symbol, decimals] = (await Promise.all([
      publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' } as never),
      publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' } as never)
    ])) as unknown as [string, number]
    return { symbol, decimals: Number(decimals) }
  } catch {
    return { symbol: token.slice(0, 6), decimals: 18 }
  }
}

/** ERC20 balance of an account. */
export async function fetchTokenBalance(token: `0x${string}`, account: `0x${string}`): Promise<bigint> {
  return (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account]
  })) as bigint
}

/** ERC20 allowance of owner → spender. */
export async function fetchAllowance(
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`
): Promise<bigint> {
  return (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender]
  })) as bigint
}

/** A depositor's share balance in a vault. */
export async function fetchSharesOf(vault: `0x${string}`, account: `0x${string}`): Promise<bigint> {
  return (await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: 'sharesOf',
    args: [account]
  })) as bigint
}
