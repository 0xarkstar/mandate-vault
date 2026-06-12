import type { VaultState } from '../lib/types'
import { config, addressExplorerUrl } from '../config'
import { bpsToPct, formatUsd, formatWad, shortenAddress } from '../lib/format'
import { deriveVaultName, templateTagline, templateSublabel } from '../lib/vault-name'
import { Badge } from './ui/Badge'
import { StatTile } from './ui/Card'

/**
 * Distance (in bps of share price) from the current price to the drawdown
 * trip floor. Negative means already breached.
 */
function drawdownDistanceBps(state: VaultState): number {
  if (state.hwmSharePrice === 0n) return 0
  const floor = (state.hwmSharePrice * BigInt(10_000 - state.mandate.maxDrawdownBps)) / 10_000n
  if (floor === 0n) return 0
  const distance = ((state.sharePrice - floor) * 10_000n) / state.hwmSharePrice
  return Number(distance)
}

export function VaultHeader({ state, symbols }: { state: VaultState; symbols: readonly string[] }) {
  const template = deriveVaultName(state.mandate)
  const sublabel = templateSublabel(template)
  const ddDistance = drawdownDistanceBps(state)
  const ddTone = ddDistance <= 0 ? 'text-rose-soft' : ddDistance < 200 ? 'text-amber-soft' : 'text-mist-100'

  return (
    <div className="mv-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-mist-100">{template}</h1>
            {state.killed ? (
              <Badge tone="rose">Killed</Badge>
            ) : state.tripped ? (
              <Badge tone="amber">Tripped · de-risked</Badge>
            ) : (
              <Badge tone="green">Active</Badge>
            )}
          </div>
          {sublabel ? <p className="mt-1 text-sm font-medium text-accent-400">{sublabel}</p> : null}
          <p className="mt-0.5 text-sm text-mist-400">{templateTagline(template)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mist-400">
            <a
              href={addressExplorerUrl(config, state.address)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-azure-400 hover:underline"
            >
              vault {shortenAddress(state.address)} ↗
            </a>
            <span className="font-mono">
              agent{' '}
              <a
                href={addressExplorerUrl(config, state.mandate.agent)}
                target="_blank"
                rel="noreferrer"
                className="text-azure-400 hover:underline"
              >
                {shortenAddress(state.mandate.agent)}
              </a>
            </span>
            <span>{state.epoch} decisions</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Share price" value={`$${formatWad(state.sharePrice)}`} />
        <StatTile label="High-water mark" value={`$${formatWad(state.hwmSharePrice)}`} />
        <StatTile
          label="Drawdown floor distance"
          value={<span className={ddTone}>{bpsToPct(Math.max(ddDistance, -10_000))}</span>}
          hint={`trips at -${bpsToPct(state.mandate.maxDrawdownBps)} from HWM`}
        />
        <StatTile label="Total value" value={formatUsd(state.totalValue)} hint={`${symbols.length} assets`} />
      </div>
    </div>
  )
}
