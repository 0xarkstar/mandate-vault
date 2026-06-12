import type { CageDiagram as CageModel, CageRow } from '../lib/cage'
import { bpsToPct } from '../lib/format'
import { assetColor } from './AllocationBar'

/**
 * Visualises "AI wanted → mandate allowed" for one decision: per asset, the
 * allowed [min, max] band with a marker for the raw proposed bps and one for
 * the clamped bps. When they differ (the cage bit) the gap is highlighted.
 */
export function CageDiagram({
  diagram,
  symbols
}: {
  diagram: CageModel
  symbols: readonly string[]
}) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-mist-400">
          Cage · AI wanted → mandate allowed
        </div>
        <Legend />
      </div>
      <div className="space-y-3">
        {diagram.rows.map((row) => (
          <CageBar key={row.index} row={row} symbol={symbols[row.index] ?? `asset ${row.index}`} />
        ))}
      </div>
    </div>
  )
}

function CageBar({ row, symbol }: { row: CageRow; symbol: string }) {
  const color = assetColor(row.index)
  const rawLeft = clampPct(row.rawBps)
  const clampedLeft = clampPct(row.clampedBps)

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-mist-200">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {symbol}
        </span>
        <span className="font-mono text-mist-400">
          {bpsToPct(row.minBps)} – {bpsToPct(row.maxBps)}
        </span>
      </div>
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-ink-800 ring-1 ring-inset ring-ink-700">
        {/* allowed band */}
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${row.minBps / 100}%`,
            width: `${(row.maxBps - row.minBps) / 100}%`,
            background: `${color}33`
          }}
        />
        {/* clamp-delta highlight between raw and clamped */}
        {row.cageHit ? (
          <div
            className="absolute inset-y-0 bg-amber-soft/30"
            style={{
              left: `${Math.min(rawLeft, clampedLeft)}%`,
              width: `${Math.abs(clampedLeft - rawLeft)}%`
            }}
          />
        ) : null}
        {/* raw proposal marker */}
        <Marker left={rawLeft} title={`AI wanted ${bpsToPct(row.rawBps)}`} className="bg-mist-400" />
        {/* clamped marker */}
        <Marker
          left={clampedLeft}
          title={`allowed ${bpsToPct(row.clampedBps)}`}
          className="bg-mist-100"
        />
      </div>
      {row.cageHit ? (
        <div className="mt-1 text-[10px] text-amber-soft">
          cage bit: {bpsToPct(row.rawBps)} → {bpsToPct(row.clampedBps)} ({signed(row.deltaBps)})
        </div>
      ) : null}
    </div>
  )
}

function Marker({ left, title, className }: { left: number; title: string; className: string }) {
  return (
    <div
      className={`absolute inset-y-0 w-[3px] rounded-full ${className}`}
      style={{ left: `calc(${left}% - 1.5px)` }}
      title={title}
    />
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-mist-400">
      <span className="flex items-center gap-1">
        <span className="h-2 w-[3px] rounded-full bg-mist-400" /> wanted
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-[3px] rounded-full bg-mist-100" /> allowed
      </span>
    </div>
  )
}

function clampPct(bps: number): number {
  return Math.min(100, Math.max(0, bps / 100))
}

function signed(bps: number): string {
  return `${bps > 0 ? '+' : ''}${bpsToPct(bps)}`
}
