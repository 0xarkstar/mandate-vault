import { bpsToPct } from '../lib/format'

const PALETTE = ['#22c55e', '#3b82f6', '#f5b942', '#a78bfa', '#f87171', '#2dd4bf', '#fb923c', '#94a3b8']

export function assetColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? '#94a3b8'
}

/** Horizontal stacked bar of a current/target allocation across assets. */
export function AllocationBar({
  bps,
  symbols,
  height = 14
}: {
  bps: readonly number[]
  symbols: readonly string[]
  height?: number
}) {
  const total = bps.reduce((a, b) => a + b, 0) || 1
  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded-full bg-ink-800 ring-1 ring-inset ring-ink-700"
        style={{ height }}
      >
        {bps.map((b, i) => (
          <div
            key={i}
            title={`${symbols[i] ?? `asset ${i}`}: ${bpsToPct(b)}`}
            style={{ width: `${(b / total) * 100}%`, background: assetColor(i) }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {bps.map((b, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-mist-300">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: assetColor(i) }} />
            <span className="font-medium text-mist-200">{symbols[i] ?? `asset ${i}`}</span>
            <span className="font-mono text-mist-400">{bpsToPct(b)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
