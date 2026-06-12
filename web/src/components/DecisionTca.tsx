import type { DecisionTca as TcaModel } from '../lib/fills-tca'
import { formatImprovementBps } from '../lib/fills-tca'
import { formatWad, shortenAddress } from '../lib/format'
import { Badge } from './ui/Badge'

/**
 * Per-decision execution-quality (TCA) strip: for each RFQ fill that settled in
 * this decision's tx, the fill amount vs the oracle mid and an improvement-bps
 * badge (green when the fill beat the mid, rose when it lagged).
 */
export function DecisionTca({ tca }: { tca: TcaModel }) {
  if (tca.fillCount === 0) return null

  return (
    <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-mist-400">
          Execution · fill vs oracle mid
        </span>
        <ImprovementBadge bps={tca.avgImprovementBps} label="avg" />
      </div>
      <div className="space-y-1">
        {tca.fills.map((f, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="font-mono text-mist-400">mm {shortenAddress(f.mm, 6, 4)}</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-mist-300">
                {formatWad(f.amountOut, 2)} <span className="text-mist-400">/ mid</span>{' '}
                {formatWad(f.oracleMidOut, 2)}
              </span>
              <ImprovementBadge bps={f.improvementBps} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ImprovementBadge({ bps, label }: { bps: number; label?: string }) {
  const tone = bps >= 0 ? 'green' : 'rose'
  return (
    <Badge tone={tone}>
      {label ? `${label} ` : ''}
      {formatImprovementBps(bps)}
    </Badge>
  )
}
