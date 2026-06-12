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
  // batchSize capped: free public gateways truncate or reject large JSON-RPC
  // batches; retries with backoff ride out per-IP rate-limit windows.
  transport: http(config.rpcUrl, {
    batch: { batchSize: 5, wait: 50 },
    retryCount: 4,
    retryDelay: 2000
  })
})
