import { config } from '../config'
import { useVaults } from '../hooks/useVaults'
import { VaultCard } from '../components/VaultCard'
import { SetupNotice } from '../components/SetupNotice'
import { Card } from '../components/ui/Card'

export function VaultsPage() {
  const { loading, error, vaults } = useVaults()

  if (!config.factoryAddress) return <SetupNotice />

  return (
    <div className="mv-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-mist-100">Mandate-Caged Vaults</h1>
        <p className="mt-2 max-w-2xl text-sm text-mist-300">
          Each vault encodes a human investment mandate on-chain. An AI agent may only rebalance within its
          per-asset bounds — out-of-bounds proposals revert, and a drawdown breach auto-de-risks to the safe
          asset. Every decision is logged with its full input snapshot for independent replay.
        </p>
      </div>

      {loading ? <LoadingGrid /> : null}
      {error ? <ErrorCard message={error} /> : null}
      {!loading && !error && vaults.length === 0 ? (
        <Card className="p-8 text-center text-sm text-mist-300">
          No vaults deployed yet on this factory.
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {vaults.map((entry) => (
          <VaultCard key={entry.state.address} entry={entry} />
        ))}
      </div>
    </div>
  )
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-64 animate-pulse rounded-2xl border border-ink-700 bg-ink-850/50" />
      ))}
    </div>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="p-6">
      <p className="text-sm text-rose-soft">Failed to load vaults: {message}</p>
      <p className="mt-2 text-xs text-mist-400">
        Check the RPC endpoint and factory address, then reload.
      </p>
    </Card>
  )
}
