import { config } from '../config'
import { useVaults } from '../hooks/useVaults'
import { VaultCard } from '../components/VaultCard'
import { SetupNotice } from '../components/SetupNotice'
import { Card } from '../components/ui/Card'

const ENGINES = [
  { lane: 'mv-lane-deliberation', name: 'Deliberation', tag: 'LLM', desc: 'proposes WHAT — a different model reviews' },
  { lane: 'mv-lane-execution', name: 'Execution', tag: 'NO LLM', desc: 'decides HOW — deterministic RFQ, never dumps' },
  { lane: 'mv-lane-chain', name: 'On-chain', tag: 'PROVEN', desc: 're-checks the mandate, records every decision' }
] as const

export function VaultsPage() {
  const { loading, error, vaults } = useVaults()

  if (!config.factoryAddress) return <SetupNotice />

  return (
    <div className="mv-fade-in">
      <section className="mv-elevated rounded-3xl border border-ink-700 p-7 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-400">
          AI-delegated capital, caged on-chain
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-mist-100 sm:text-4xl">
          The AI decides <span className="text-accent-400">how</span> capital moves —
          never <span className="text-mist-300">whether</span>. The mandate is enforced by the
          contract, and every decision is replayable by anyone.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-mist-300">
          Each vault encodes a human investment mandate on-chain. An agent may only rebalance within
          its bounds — out-of-bounds proposals revert, a drawdown breach freezes the agent, and
          execution routes through signed RFQ quotes so nothing ever hits a public mempool.
        </p>

        <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ENGINES.map((e, i) => (
            <div
              key={e.name}
              className={`mv-lane ${e.lane} mv-rise rounded-2xl border border-ink-700 bg-ink-900/40 p-4`}
              style={{ ['--i' as string]: i }}
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: 'var(--lane)' }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--lane)' }}>
                  {e.name}
                </span>
                <span
                  className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    color: 'var(--lane)',
                    background: 'color-mix(in oklab, var(--lane) 14%, transparent)',
                    boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--lane) 30%, transparent)'
                  }}
                >
                  {e.tag}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-mist-400">{e.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-mist-500">
          Open any vault to watch a real decision flow through all three, step by step.
        </p>
      </section>

      <div className="mt-8 mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-mist-400">Vaults</h2>
        {!loading && !error ? (
          <span className="text-xs text-mist-500">{vaults.length} on this factory</span>
        ) : null}
      </div>

      {loading ? <LoadingGrid /> : null}
      {error ? <ErrorCard message={error} /> : null}
      {!loading && !error && vaults.length === 0 ? (
        <Card className="p-8 text-center text-sm text-mist-300">No vaults deployed yet on this factory.</Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {vaults.map((entry, i) => (
          <div key={entry.state.address} className="mv-rise" style={{ ['--i' as string]: i }}>
            <VaultCard entry={entry} />
          </div>
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
      <p className="mt-2 text-xs text-mist-400">Check the RPC endpoint and factory address, then reload.</p>
    </Card>
  )
}
