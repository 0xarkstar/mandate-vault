import { useState } from 'react'
import type { Decision, Mandate } from '../lib/types'
import { config, txUrl } from '../config'
import { bpsToPct, shortenAddress, timeAgo } from '../lib/format'
import { computeClampDelta, extractRegime, extractTargetBps } from '../lib/clamp-delta'
import { extractSnapshotMeta } from '../lib/snapshot-meta'
import { buildCageDiagram } from '../lib/cage'
import type { DecisionTca as TcaModel } from '../lib/fills-tca'
import { Card } from './ui/Card'
import { RegimeBadge } from './RegimeBadge'
import { BehaviorBadges } from './BehaviorBadges'
import { CageDiagram } from './CageDiagram'
import { DecisionTca } from './DecisionTca'
import { VerifyButton } from './VerifyButton'

type Regime = 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF'

export function DecisionRow({
  decision,
  mandate,
  symbols,
  tca,
  prevRegime
}: {
  decision: Decision
  mandate: Mandate
  symbols: readonly string[]
  tca?: TcaModel
  prevRegime?: Regime | null
}) {
  const [rationaleOpen, setRationaleOpen] = useState(false)
  const [cageOpen, setCageOpen] = useState(false)
  const regime = extractRegime(decision.rawProposalJson)
  const rawBps = extractTargetBps(decision.rawProposalJson)
  const delta = computeClampDelta(rawBps, decision.clampedAllocBps)
  const meta = extractSnapshotMeta(decision.snapshotJson)
  const cage = buildCageDiagram(rawBps, decision.clampedAllocBps, mandate.minBps, mandate.maxBps)

  const signals = {
    regimeShift: regime !== null && prevRegime != null && regime !== prevRegime,
    cageHit: delta.anyChanged,
    llmFallback: meta.llmFallback,
    playbookVersion: meta.playbookVersion
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm font-semibold text-mist-100">#{decision.epoch}</span>
          <RegimeBadge regime={regime} />
          <BehaviorBadges signals={signals} />
          <span className="text-xs text-mist-400">{timeAgo(decision.timestamp)}</span>
        </div>
        <a
          href={txUrl(config, decision.txHash)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-azure-400 underline-offset-4 hover:underline"
        >
          tx {shortenAddress(decision.txHash, 6, 4)} ↗
        </a>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProposalColumn
          title="Raw LLM proposal"
          rows={delta.rows.map((r) => ({ symbol: symbols[r.index] ?? `asset ${r.index}`, bps: r.raw }))}
          empty={rawBps.length === 0}
        />
        <ClampedColumn delta={delta} symbols={symbols} />
      </div>

      {delta.anyChanged ? (
        <div className="mt-3 rounded-lg border border-amber-soft/30 bg-amber-soft/10 px-3 py-2 text-xs text-amber-soft">
          ⚖️ Mandate clamp engaged — the agent's proposal was pulled back inside the bounds before execution.
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-xs text-accent-400">
          ✓ Proposal was already within mandate bounds — clamp was a no-op.
        </div>
      )}

      {tca ? <DecisionTca tca={tca} /> : null}

      <div className="mt-3">
        <button
          onClick={() => setCageOpen((o) => !o)}
          className="text-xs font-medium text-mist-300 hover:text-mist-100"
        >
          {cageOpen ? '▾ Hide cage diagram' : '▸ Show cage diagram'}
        </button>
        {cageOpen ? (
          <div className="mt-2">
            <CageDiagram diagram={cage} symbols={symbols} />
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button
            onClick={() => setRationaleOpen((o) => !o)}
            className="text-xs font-medium text-mist-300 hover:text-mist-100"
          >
            {rationaleOpen ? '▾ Hide rationale' : '▸ Show rationale'}
          </button>
          {rationaleOpen ? (
            <p className="mt-2 whitespace-pre-wrap rounded-lg border border-ink-700 bg-ink-900/50 p-3 text-xs leading-relaxed text-mist-300">
              {decision.rationale || '(no rationale recorded)'}
            </p>
          ) : null}
        </div>
        <VerifyButton decision={decision} mandate={mandate} />
      </div>
    </Card>
  )
}

function ProposalColumn({
  title,
  rows,
  empty
}: {
  title: string
  rows: { symbol: string; bps: number }[]
  empty: boolean
}) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/40 p-3">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-mist-400">{title}</div>
      {empty ? (
        <div className="text-xs text-mist-400">unparseable / not recorded</div>
      ) : (
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-mist-300">{r.symbol}</span>
              <span className="font-mono text-mist-200">{bpsToPct(r.bps)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ClampedColumn({
  delta,
  symbols
}: {
  delta: ReturnType<typeof computeClampDelta>
  symbols: readonly string[]
}) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/40 p-3">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-mist-400">
        Clamped allocation (on-chain)
      </div>
      <div className="space-y-1">
        {delta.rows.map((r) => (
          <div key={r.index} className="flex items-center justify-between text-xs">
            <span className="text-mist-300">{symbols[r.index] ?? `asset ${r.index}`}</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-mist-100">{bpsToPct(r.clamped)}</span>
              {r.changed ? (
                <span
                  className={`font-mono text-[10px] ${r.delta > 0 ? 'text-accent-400' : 'text-rose-soft'}`}
                >
                  {r.delta > 0 ? '+' : ''}
                  {bpsToPct(r.delta)}
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
