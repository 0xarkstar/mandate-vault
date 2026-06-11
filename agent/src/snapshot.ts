import { SnapshotSchema, type Snapshot } from '@mandate-vault/clamp-core'
import type { FundingSnapshot } from './feeds/funding.js'
import type { VaultState } from './feeds/vault.js'

/**
 * Assemble the Snapshot object that is hashed and emitted on-chain. It must
 * match SnapshotSchema from clamp-core EXACTLY so the verifier can recompute the
 * same canonical bytes:
 *   - prices keyed by lowercase asset address, decimal-string 1e18 values
 *   - vaultState.{sharePrice,hwm} as decimal strings
 *   - vault address lowercase
 *   - llmFallback only present when the LLM was unavailable
 */
export interface SnapshotInputs {
  chainId: number
  vault: string
  ts: number
  funding: FundingSnapshot
  vaultState: VaultState
  llmFallback: boolean
}

export function buildSnapshot(inputs: SnapshotInputs): Snapshot {
  const { chainId, vault, ts, funding, vaultState, llmFallback } = inputs

  const prices: Record<string, string> = {}
  for (const [addr, price] of Object.entries(vaultState.prices)) {
    prices[addr.toLowerCase()] = price.toString()
  }

  const snapshot: Snapshot = {
    ts,
    chainId,
    vault: vault.toLowerCase(),
    funding: {
      lastRate: funding.lastRate,
      mean7d: funding.mean7d,
      markPrice: funding.markPrice
    },
    prices,
    vaultState: {
      allocBps: vaultState.allocBps,
      sharePrice: vaultState.sharePrice.toString(),
      hwm: vaultState.hwm.toString(),
      tripped: vaultState.tripped
    }
  }

  // Only attach the flag when true, so a normal snapshot stays minimal and the
  // verifier's recomputation matches byte-for-byte (canonicalJson drops it when
  // undefined anyway, but keeping it conditional is clearer).
  const withFlag = llmFallback ? { ...snapshot, llmFallback: true } : snapshot

  // Defensive: parse through the schema so a drift from clamp-core fails loud.
  return SnapshotSchema.parse(withFlag) as Snapshot
}
