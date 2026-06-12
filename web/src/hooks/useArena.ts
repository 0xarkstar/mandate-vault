import { useEffect, useState } from 'react'
import { config } from '../config'
import { fetchAllVaults, fetchTokenMeta, fetchVaultState } from '../chain/reads'
import { fetchDecisions } from '../chain/decisions'
import { fetchFills } from '../chain/fills'
import { summarizeVault, type ArenaRow } from '../lib/arena-vault'
import { deriveVaultName, type VaultTemplate } from '../lib/vault-name'
import type { VaultState } from '../lib/types'

export interface ArenaEntry {
  state: VaultState
  template: VaultTemplate
  safeSymbol: string
  row: ArenaRow
}

interface ArenaResult {
  loading: boolean
  error: string | null
  entries: ArenaEntry[]
}

const symbolCache = new Map<string, string>()

async function safeSymbolOf(asset: `0x${string}`): Promise<string> {
  const cached = symbolCache.get(asset.toLowerCase())
  if (cached) return cached
  const meta = await fetchTokenMeta(asset)
  symbolCache.set(asset.toLowerCase(), meta.symbol)
  return meta.symbol
}

/**
 * Load every factory vault and score each on execution quality (NOT alpha).
 * Entries are returned sorted by score, highest first.
 */
export function useArena(): ArenaResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<ArenaEntry[]>([])

  useEffect(() => {
    if (!config.factoryAddress) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    const factory = config.factoryAddress
    ;(async () => {
      try {
        const addresses = await fetchAllVaults(factory)
        const built = await Promise.all(
          addresses.map(async (addr): Promise<ArenaEntry> => {
            const [state, decisions, fills] = await Promise.all([
              fetchVaultState(addr),
              fetchDecisions(addr).catch(() => []),
              fetchFills(addr).catch(() => [])
            ])
            const safeSymbol = await safeSymbolOf(state.mandate.assets[0] ?? ('0x' as `0x${string}`))
            const row = summarizeVault(decisions, fills, state.mandate.minBps, state.mandate.maxBps)
            return { state, template: deriveVaultName(state.mandate), safeSymbol, row }
          })
        )
        built.sort((a, b) => b.row.score.score - a.row.score.score)
        if (!cancelled) setEntries(built)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load arena')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return { loading, error, entries }
}
