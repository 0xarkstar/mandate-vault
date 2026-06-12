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
    contracts: {
      // Canonical multicall3 — live on Mantle Sepolia (verified via
      // eth_getCode). The e2e anvil script injects the same bytecode locally
      // (anvil has no predeploy) so dashboards work against both chains.
      multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' }
    },
    testnet: true
  })
}
