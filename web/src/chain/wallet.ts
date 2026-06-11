import { createWalletClient, custom, type WalletClient, type EIP1193Provider } from 'viem'
import { config } from '../config'
import { mantleSepolia } from './chain'

/** Narrow window.ethereum without leaning on ambient global types. */
function getInjectedProvider(): EIP1193Provider | null {
  if (typeof window === 'undefined') return null
  const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum
  return eth ?? null
}

export function hasInjectedWallet(): boolean {
  return getInjectedProvider() !== null
}

export interface WalletConnection {
  account: `0x${string}`
  client: WalletClient
}

/**
 * Connect an injected wallet, requesting accounts and switching to Mantle
 * Sepolia (adding the chain if the wallet doesn't know it). Returns the active
 * account + a viem wallet client. Throws a descriptive error on rejection.
 */
export async function connectWallet(): Promise<WalletConnection> {
  const provider = getInjectedProvider()
  if (!provider) {
    throw new Error('No injected wallet found. Install a browser wallet to deposit or mint.')
  }

  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
  const account = accounts[0]
  if (!account) throw new Error('Wallet returned no account.')

  await ensureChain(provider)

  const client = createWalletClient({
    account: account as `0x${string}`,
    chain: mantleSepolia(config),
    transport: custom(provider)
  })

  return { account: account as `0x${string}`, client }
}

async function ensureChain(provider: EIP1193Provider): Promise<void> {
  const hexId = `0x${config.chainId.toString(16)}`
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] })
  } catch (err) {
    // 4902 = chain unknown to the wallet → add it, then it becomes active.
    if (isChainNotAddedError(err)) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: hexId,
            chainName: 'Mantle Sepolia',
            nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
            rpcUrls: [config.rpcUrl],
            blockExplorerUrls: [config.explorerUrl]
          }
        ]
      })
    } else {
      throw err
    }
  }
}

function isChainNotAddedError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 4902
  )
}
