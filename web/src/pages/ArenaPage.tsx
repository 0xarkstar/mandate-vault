import { config } from '../config'
import { useArena, type ArenaEntry } from '../hooks/useArena'
import { navigate } from '../lib/router'
import { templateSublabel } from '../lib/vault-name'
import { formatImprovementBps } from '../lib/fills-tca'
import { bpsToPct, shortenAddress } from '../lib/format'
import { SetupNotice } from '../components/SetupNotice'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'

export function ArenaPage() {
  const { loading, error, entries } = useArena()

  if (!config.factoryAddress) return <SetupNotice />

  return (
    <div className="mv-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-mist-100">Agent Arena</h1>
        <p className="mt-2 max-w-3xl text-sm text-mist-300">
          Vaults ranked by <span className="text-mist-100">execution quality</span> — fill-vs-mid
          improvement, mandate fit (cage-hit rate) and autonomy (LLM-fallback rate). This scores{' '}
          <span className="text-mist-100">how</span> the AI moves capital, never alpha or returns. Per-model
          attribution is roadmap (the proposer model is not recorded on-chain).
        </p>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl border border-ink-700 bg-ink-850/50" />
      ) : error ? (
        <Card className="p-6">
          <p className="text-sm text-rose-soft">Failed to load arena: {error}</p>
        </Card>
      ) : entries.length === 0 ? (
        <Card className="p-8 text-center text-sm text-mist-300">No vaults deployed yet on this factory.</Card>
      ) : (
        <Leaderboard entries={entries} />
      )}
    </div>
  )
}

function Leaderboard({ entries }: { entries: ArenaEntry[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wider text-mist-400">
              <Th className="pl-5">#</Th>
              <Th>Vault</Th>
              <Th className="text-right">Decisions</Th>
              <Th className="text-right">Avg improvement</Th>
              <Th className="text-right">Cage-hit rate</Th>
              <Th className="pr-5 text-right">Score</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <Row key={e.state.address} entry={e} rank={i + 1} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Row({ entry, rank }: { entry: ArenaEntry; rank: number }) {
  const sublabel = templateSublabel(entry.template)
  const improvementTone = entry.row.avgImprovementBps >= 0 ? 'text-accent-400' : 'text-rose-soft'

  return (
    <tr
      onClick={() => navigate({ name: 'vault', address: entry.state.address })}
      className="cursor-pointer border-b border-ink-800 transition-colors last:border-0 hover:bg-ink-800/50"
    >
      <Td className="pl-5 font-mono text-mist-400">{rank}</Td>
      <Td>
        <div className="font-medium text-mist-100">{entry.template}</div>
        <div className="text-xs text-mist-400">
          {sublabel ? `${sublabel} · ` : ''}
          <span className="font-mono">{shortenAddress(entry.state.address)}</span>
        </div>
      </Td>
      <Td className="text-right font-mono text-mist-200">{entry.row.decisionCount}</Td>
      <Td className={`text-right font-mono ${improvementTone}`}>
        {formatImprovementBps(entry.row.avgImprovementBps)}
      </Td>
      <Td className="text-right font-mono text-mist-200">{bpsToPct(entry.row.cageHitRate * 10_000)}</Td>
      <Td className="pr-5 text-right">
        <ScoreBadge score={entry.row.score.score} />
      </Td>
    </tr>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 80 ? 'green' : score >= 50 ? 'blue' : 'amber'
  return <Badge tone={tone}>{score}</Badge>
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-3 font-medium ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 ${className}`}>{children}</td>
}
