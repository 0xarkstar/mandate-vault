import type { Mandate } from '../lib/types'
import { bpsToPct, bpsPerYearToPct, formatCooldown } from '../lib/format'
import { assetColor } from './AllocationBar'
import { Card, SectionTitle } from './ui/Card'

/** A per-asset [min..max] bound bar with the current allocation marked. */
function BoundBar({
  index,
  min,
  max,
  current,
  symbol
}: {
  index: number
  min: number
  max: number
  current?: number
  symbol: string
}) {
  const color = assetColor(index)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-mist-200">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {symbol}
        </span>
        <span className="font-mono text-mist-400">
          {bpsToPct(min)} – {bpsToPct(max)}
        </span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink-800 ring-1 ring-inset ring-ink-700">
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${min / 100}%`,
            width: `${(max - min) / 100}%`,
            background: `${color}40`
          }}
        />
        {typeof current === 'number' ? (
          <div
            className="absolute inset-y-0 w-[3px] rounded-full"
            style={{ left: `calc(${current / 100}% - 1.5px)`, background: color }}
            title={`current ${bpsToPct(current)}`}
          />
        ) : null}
      </div>
    </div>
  )
}

export function MandateCard({
  mandate,
  symbols,
  currentBps
}: {
  mandate: Mandate
  symbols: readonly string[]
  currentBps?: readonly number[]
}) {
  return (
    <Card className="p-5">
      <SectionTitle sub="Per-asset allocation bounds enforced on-chain at every rebalance.">
        Mandate
      </SectionTitle>

      <div className="space-y-4">
        {mandate.assets.map((_, i) => (
          <BoundBar
            key={i}
            index={i}
            min={mandate.minBps[i] ?? 0}
            max={mandate.maxBps[i] ?? 0}
            current={currentBps?.[i]}
            symbol={symbols[i] ?? `asset ${i}`}
          />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MandateStat label="Max drawdown" value={bpsToPct(mandate.maxDrawdownBps)} />
        <MandateStat label="Cooldown" value={formatCooldown(mandate.rebalanceCooldown)} />
        <MandateStat label="Mgmt fee" value={`${bpsPerYearToPct(mandate.mgmtFeeBpsPerYear)}/yr`} />
        <MandateStat label="Perf fee" value={bpsToPct(mandate.perfFeeBps)} />
      </div>
      <div className="mt-3 text-xs text-mist-400">
        Hurdle {bpsPerYearToPct(mandate.hurdleBpsPerYear)}/yr · safe asset ={' '}
        <span className="font-medium text-mist-300">{symbols[0] ?? 'asset 0'}</span>
      </div>
      <div className="mt-2 text-xs text-mist-400">
        On breach:{' '}
        {mandate.tripMode === 'DERISK' ? (
          <span className="font-medium text-amber-soft">DERISK (sell to safe)</span>
        ) : (
          <span className="font-medium text-mist-300">FREEZE (hold positions)</span>
        )}
      </div>
    </Card>
  )
}

function MandateStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-mist-400">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-mist-100">{value}</div>
    </div>
  )
}
