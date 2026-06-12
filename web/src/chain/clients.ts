import { createPublicClient, http } from 'viem'
import type { PublicClient } from 'viem'
import { config } from '../config'
import { mantleSepolia } from './chain'

/**
 * Read-only viem public client. The dashboard reads everything through this;
 * wallet (write) access is layered on separately and is fully optional.
 */
export const publicClient: PublicClient = createPublicClient({
  chain: mantleSepolia(config),
  // multicall3 aggregation collapses the page's ~40 readContract calls into
  // 2-3 eth_calls — free public RPCs meter per CALL, and this keeps a full
  // page load inside their per-IP budgets. Retries ride out residual 429s.
  batch: { multicall: { batchSize: 2048, wait: 50 } },
  transport: http(config.rpcUrl, {
    batch: { batchSize: 5, wait: 50 },
    retryCount: 4,
    retryDelay: 2000
  })
})
