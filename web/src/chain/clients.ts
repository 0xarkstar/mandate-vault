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
  transport: http(config.rpcUrl, { batch: true })
})
