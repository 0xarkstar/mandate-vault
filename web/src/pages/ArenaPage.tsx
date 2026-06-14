import { config } from '../config'
import { useArena, type ArenaEntry } from '../hooks/useArena'
import { navigate } from '../lib/router'
import { templateSublabel } from '../lib/vault-name'
import { formatImprovementBps } from '../lib/fills-tca'
import { bpsToPct, shortenAddress } from '../lib/format'
import { SetupNotice } from '../components/SetupNotice'
import { Card } from '../components/ui/Card'

const WEIGHTS = [
  { lane: 'mv-lane-execution', w: '50%', label: 'Fill vs mid', desc: 'execution quality' },
  { lane: 'mv-lane-deliberation', w: '30%', label: 'Cage discipline', desc: 'fewer clamps' },
  { lane: 'mv-lane-chain', w: '20%', label: 'Autonomy', desc: 'fewer fallbacks' }
] as const

export function ArenaPage() {
  const { loading, error, entries } = useArena()
  if (!config.factoryAddress) return <SetupNotice />

  return (
    <div className="mv-fade-in">
      <section className="mv-elevated rounded-3xl border border-ink-700 p-7 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-400">
          On-chain AI benchmarking
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-mist-100 sm:text-4xl">Agent Arena</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mist-300">
          Same rails, different brains. Each vault&apos;s agent is scored on{' '}
          <span className="text-mist-100">execution quality</span> — never alpha — from on-chain
          behavior alone. Every input is observable and independently replayable.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {WEIGHTS.map((x) => (
            <div key={x.label} className={`mv-lane ${x.lane} rounded-xl border border-ink-700 bg-ink-900/40 p-3`}>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-lg font-semibold" style={{ color: 'var(--lane)' }}>
                  {x.w}
                </span>
                <span className="text-sm font-medium text-mist-200">{x.label}</span>
              </div>
              <p className="mt-0.5 text-xs text-mist-500">{x.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8">
        {loading ? (
          <div className="h-64 animate-pulse rounded-2xl border border-ink-700 bg-ink-850/50" />
        ) : error ? (
          <Card className="p-6">
            <p className="text-sm text-rose-soft">Failed to load arena: {error}</p>
          </Card>
        ) : entries.length === 0 ? (
          <Card className="p-8 text-center text-sm text-mist-300">No vaults deployed yet on this factory.</Card>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, i) => (
              <LeaderRow key={entry.state.address} entry={entry} rank={i + 1} />
            ))}
          </div>
        )}
      </div>

      <p className="mt-5 text-xs text-mist-500">
        Per-model attribution runs off-chain (agent <span className="font-mono">--model</span>); on-chain
        model identity via ERC-8004 is roadmap.
      </p>
    </div>
  )
}

const MEDAL = ['🥇', '🥈', '🥉'] as const

function LeaderRow({ entry, rank }: { entry: ArenaEntry; rank: number }) {
  const { state, template, row } = entry
  const sublabel = templateSublabel(template)
  const score = row.score.score
  const tone =
    score >= 70
      ? { text: 'text-accent-400', bar: 'bg-accent-400' }
      : score >= 40
        ? { text: 'text-azure-400', bar: 'bg-azure-400' }
        : { text: 'text-amber-soft', bar: 'bg-amber-soft' }
  const improvementTone = row.avgImprovementBps >= 0 ? 'text-accent-400' : 'text-rose-soft'

  return (
    <Card
      className="group p-4 transition-transform duration-200 hover:-translate-y-0.5 sm:p-5"
      onClick={() => navigate({ name: 'vault', address: state.address })}
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex w-8 shrink-0 items-center justify-center text-lg">
          {rank <= 3 ? MEDAL[rank - 1] : <span className="font-mono text-sm text-mist-500">{rank}</span>}
        </div>

        <div className="min-w-[8rem] flex-1">
          <div className="font-medium text-mist-100">{template}</div>
          <div className="text-xs text-mist-500">
            {sublabel ? `${sublabel} · ` : ''}
            <span className="font-mono">{shortenAddress(state.address)}</span>
          </div>
        </div>

        <div className="hidden text-right sm:block">
          <div className="font-mono text-sm text-mist-200">{row.decisionCount}</div>
          <div className="text-[10px] uppercase tracking-wider text-mist-500">decisions</div>
        </div>

        <div className="text-right">
          <div className={`font-mono text-sm ${improvementTone}`}>{formatImprovementBps(row.avgImprovementBps)}</div>
          <div className="text-[10px] uppercase tracking-wider text-mist-500">fill vs mid</div>
        </div>

        <div className="hidden text-right md:block">
          <div className="font-mono text-sm text-mist-200">{bpsToPct(row.cageHitRate * 10_000)}</div>
          <div className="text-[10px] uppercase tracking-wider text-mist-500">cage-hit</div>
        </div>

        <div className="w-32 shrink-0">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-mist-500">score</span>
            <span className={`font-mono text-sm font-semibold ${tone.text}`}>{score.toFixed(1)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
            <div
              className={`h-full rounded-full ${tone.bar} transition-all duration-500`}
              style={{ width: `${Math.max(2, Math.min(100, score))}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  )
}
