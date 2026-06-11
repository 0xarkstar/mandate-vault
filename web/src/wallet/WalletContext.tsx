import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { WalletClient } from 'viem'
import { connectWallet, hasInjectedWallet } from '../chain/wallet'

interface WalletCtx {
  available: boolean
  account: `0x${string}` | null
  client: WalletClient | null
  connecting: boolean
  error: string | null
  connect: () => Promise<void>
}

const Ctx = createContext<WalletCtx | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<`0x${string}` | null>(null)
  const [client, setClient] = useState<WalletClient | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      const conn = await connectWallet()
      setAccount(conn.account)
      setClient(conn.client)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet')
    } finally {
      setConnecting(false)
    }
  }, [])

  const value = useMemo<WalletCtx>(
    () => ({ available: hasInjectedWallet(), account, client, connecting, error, connect }),
    [account, client, connecting, error, connect]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}
