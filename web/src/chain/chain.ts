import { defineChain } from 'viem'
import type { AppConfig } from '../config'

/**
 * Mantle Sepolia chain object, built manually so we never depend on
 * `viem/chains` carrying it. RPC and chainId come from validated config.
 */
export function mantleSepolia(cfg: AppConfig) {
  return defineChain({
    id: cfg.chainId,
    name: 'Mantle Sepolia',
    nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
    rpcUrls: {
      default: { http: [cfg.rpcUrl] }
    },
    blockExplorers: {
      default: { name: 'MantleScan', url: cfg.explorerUrl }
    },
    testnet: true
  })
}
