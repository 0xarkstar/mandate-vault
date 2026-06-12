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

/**
 * JSON-RPC batching + patient retries: the public Mantle Sepolia RPC
 * rate-limits bursts, and a vault-state read fans out 13+ eth_calls. Batching
 * coalesces them into one HTTP request; retries with backoff ride out the
 * residual 429s. Harmless on local anvil.
 */
function transportFor(rpcUrl: string) {
  // batchSize capped at 5: free public gateways (drpc, tenderly) truncate or
  // 500 on larger JSON-RPC batches; 13 reads become 3 requests, not 13.
  // retryDelay 15s: their rate-limit windows are sliding minutes, not seconds.
  return http(rpcUrl, { batch: { batchSize: 5, wait: 50 }, retryCount: 6, retryDelay: 15_000 })
}

/** Build a public (read) + wallet (write) client pair for a given signer. */
export function makeClients(rpcUrl: string, chainId: number, privateKey: `0x${string}`): Clients {
  const chain = mantleSepolia(rpcUrl, chainId)
  const account = privateKeyToAccount(privateKey)
  const publicClient = createPublicClient({ chain, transport: transportFor(rpcUrl) })
  // Writes stay un-batched: public gateways mishandle eth_sendRawTransaction
  // inside JSON-RPC batches; a tx is one request anyway.
  const walletClient = createWalletClient({
    chain,
    transport: http(rpcUrl, { retryCount: 6, retryDelay: 15_000 }),
    account
  })
  return { chain, publicClient, walletClient, account }
}

/** Read-only client (no signer) for feeds and views. */
export function makePublicClient(rpcUrl: string, chainId: number): PublicClient {
  const chain = mantleSepolia(rpcUrl, chainId)
  return createPublicClient({ chain, transport: transportFor(rpcUrl) })
}
