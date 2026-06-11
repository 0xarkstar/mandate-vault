import { useCallback, useEffect, useState } from 'react'
import { fetchTokenMeta, fetchVaultState } from '../chain/reads'
import { fetchDecisions } from '../chain/decisions'
import type { Decision, VaultState } from '../lib/types'

interface DetailResult {
  loading: boolean
  error: string | null
  state: VaultState | null
  symbols: string[]
  decisions: Decision[]
  decisionsLoading: boolean
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

/** Load a single vault's state, symbols and decision timeline. */
export function useVaultDetail(address: `0x${string}`): DetailResult {
  const [loading, setLoading] = useState(true)
  const [decisionsLoading, setDecisionsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<VaultState | null>(null)
  const [symbols, setSymbols] = useState<string[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const s = await fetchVaultState(address)
        const syms = await resolveSymbols(s.mandate.assets)
        if (cancelled) return
        setState(s)
        setSymbols(syms)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load vault')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [address, nonce])

  useEffect(() => {
    let cancelled = false
    setDecisionsLoading(true)
    ;(async () => {
      try {
        const d = await fetchDecisions(address)
        if (!cancelled) setDecisions(d)
      } catch {
        if (!cancelled) setDecisions([])
      } finally {
        if (!cancelled) setDecisionsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [address, nonce])

  return { loading, error, state, symbols, decisions, decisionsLoading, reload }
}
