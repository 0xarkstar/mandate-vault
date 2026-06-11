import { useCallback, useEffect, useState } from 'react'
import { fetchAllowance, fetchSharesOf, fetchTokenBalance } from '../chain/reads'
import type { VaultState } from '../lib/types'

export interface Position {
  safeBalance: bigint
  allowance: bigint
  shares: bigint
}

interface PositionResult {
  position: Position | null
  loading: boolean
  reload: () => void
}

/**
 * Load the connected account's position for a vault: safe-asset wallet balance,
 * its allowance to the vault, and the user's share balance.
 */
export function usePosition(
  state: VaultState | null,
  account: `0x${string}` | null
): PositionResult {
  const [position, setPosition] = useState<Position | null>(null)
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!state || !account) {
      setPosition(null)
      return
    }
    const safe = state.mandate.assets[0]
    if (!safe) return

    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [safeBalance, allowance, shares] = await Promise.all([
          fetchTokenBalance(safe, account),
          fetchAllowance(safe, account, state.address),
          fetchSharesOf(state.address, account)
        ])
        if (!cancelled) setPosition({ safeBalance, allowance, shares })
      } catch {
        if (!cancelled) setPosition(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [state, account, nonce])

  return { position, loading, reload }
}
