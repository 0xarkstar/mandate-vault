import type { Decision, Mandate } from '../lib/types'
import { Card, SectionTitle } from './ui/Card'
import { DecisionRow } from './DecisionRow'

export function DecisionTimeline({
  decisions,
  loading,
  mandate,
  symbols
}: {
  decisions: Decision[]
  loading: boolean
  mandate: Mandate
  symbols: readonly string[]
}) {
  return (
    <div>
      <SectionTitle sub="Every rebalance, newest first. Each row replays from on-chain event data — click Verify to recompute the hashes and clamp locally in your browser.">
        Decision timeline
      </SectionTitle>

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-ink-700 bg-ink-850/50" />
          ))}
        </div>
      ) : decisions.length === 0 ? (
        <Card className="p-6 text-sm text-mist-300">
          No decisions logged yet. Once the agent rebalances, its full input snapshot, raw proposal and
          rationale appear here for verification.
        </Card>
      ) : (
        <div className="space-y-4">
          {decisions.map((d) => (
            <DecisionRow key={d.epoch} decision={d} mandate={mandate} symbols={symbols} />
          ))}
        </div>
      )}
    </div>
  )
}
