import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Chain,
  type PublicClient,
  type WalletClient
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

/**
 * Mantle Sepolia is not in viem/chains, so define it manually. RPC and chainId
 * stay overridable via env so a fork / alternate endpoint can be substituted.
 */
export function mantleSepolia(rpcUrl: string, chainId: number): Chain {
  return defineChain({
    id: chainId,
    name: 'Mantle Sepolia',
    nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] }
    },
    blockExplorers: {
      default: { name: 'Mantlescan', url: 'https://sepolia.mantlescan.xyz' }
    },
    testnet: true
  })
}

export interface Clients {
  chain: Chain
  publicClient: PublicClient
  walletClient: WalletClient
  account: ReturnType<typeof privateKeyToAccount>
}

/** Build a public (read) + wallet (write) client pair for a given signer. */
export function makeClients(rpcUrl: string, chainId: number, privateKey: `0x${string}`): Clients {
  const chain = mantleSepolia(rpcUrl, chainId)
  const account = privateKeyToAccount(privateKey)
  const transport = http(rpcUrl)
  const publicClient = createPublicClient({ chain, transport })
  const walletClient = createWalletClient({ chain, transport, account })
  return { chain, publicClient, walletClient, account }
}

/** Read-only client (no signer) for feeds and views. */
export function makePublicClient(rpcUrl: string, chainId: number): PublicClient {
  const chain = mantleSepolia(rpcUrl, chainId)
  return createPublicClient({ chain, transport: http(rpcUrl) })
}
