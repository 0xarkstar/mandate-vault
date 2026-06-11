import type { WalletClient } from 'viem'
import { mandateVaultAbi, mockErc20Abi } from '@mandate-vault/abi'
import { config } from '../config'
import { mantleSepolia } from './chain'
import { publicClient } from './clients'

const vaultAbi = mandateVaultAbi as never
const erc20Abi = mockErc20Abi as never

async function sendAndWait(hash: `0x${string}`): Promise<`0x${string}`> {
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}

/** Faucet mint of the (open) MockERC20 — testnet only. */
export async function mintToken(
  client: WalletClient,
  token: `0x${string}`,
  to: `0x${string}`,
  amount: bigint
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    account: to,
    chain: mantleSepolia(config),
    address: token,
    abi: erc20Abi,
    functionName: 'mint',
    args: [to, amount]
  })
  return sendAndWait(hash)
}

/** Approve the vault to pull `amount` of the safe asset. */
export async function approveToken(
  client: WalletClient,
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    account: owner,
    chain: mantleSepolia(config),
    address: token,
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, amount]
  })
  return sendAndWait(hash)
}

/** Deposit the safe asset into the vault. */
export async function depositToVault(
  client: WalletClient,
  vault: `0x${string}`,
  account: `0x${string}`,
  amount: bigint
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    account,
    chain: mantleSepolia(config),
    address: vault,
    abi: vaultAbi,
    functionName: 'deposit',
    args: [amount]
  })
  return sendAndWait(hash)
}

/** Withdraw shares from the vault, receiving the safe asset. */
export async function withdrawFromVault(
  client: WalletClient,
  vault: `0x${string}`,
  account: `0x${string}`,
  shares: bigint
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    account,
    chain: mantleSepolia(config),
    address: vault,
    abi: vaultAbi,
    functionName: 'withdraw',
    args: [shares]
  })
  return sendAndWait(hash)
}
