import { useCallback, useEffect, useState } from 'react'
import { config } from '../config'
import { fetchAllVaults, fetchTokenMeta, fetchVaultState } from '../chain/reads'
import type { VaultState } from '../lib/types'

export interface VaultEntry {
  state: VaultState
  symbols: string[]
}

interface VaultsResult {
  loading: boolean
  error: string | null
  vaults: VaultEntry[]
  reload: () => void
}

const symbolCache = new Map<string, string>()

async function resolveSymbols(assets: readonly `0x${string}`[]): Promise<string[]> {
  return Promise.all(
    assets.map(async (a) => {
      const cached = symbolCache.get(a.toLowerCase())
      if (cached) return cached
      const meta = await fetchTokenMeta(a)
      symbolCache.set(a.toLowerCase(), meta.symbol)
      return meta.symbol
    })
  )
}

/** Load every vault from the factory along with its state + asset symbols. */
export function useVaults(): VaultsResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vaults, setVaults] = useState<VaultEntry[]>([])
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

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
        const entries = await Promise.all(
          addresses.map(async (addr) => {
            const state = await fetchVaultState(addr)
            const symbols = await resolveSymbols(state.mandate.assets)
            return { state, symbols }
          })
        )
        if (!cancelled) setVaults(entries)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load vaults')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [nonce])

  return { loading, error, vaults, reload }
}
