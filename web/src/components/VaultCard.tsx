import type { VaultEntry } from '../hooks/useVaults'
import { bpsToPct, formatCooldown, formatUsd, formatWad, shortenAddress } from '../lib/format'
import { deriveVaultName, templateTagline } from '../lib/vault-name'
import { navigate } from '../lib/router'
import { AllocationBar } from './AllocationBar'
import { Badge, Chip } from './ui/Badge'
import { Card } from './ui/Card'

export function VaultCard({ entry }: { entry: VaultEntry }) {
  const { state, symbols } = entry
  const template = deriveVaultName(state.mandate)

  return (
    <Card className="p-5" onClick={() => navigate({ name: 'vault', address: state.address })}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-mist-100">{template}</h3>
          <p className="mt-0.5 text-xs text-mist-400">{templateTagline(template)}</p>
        </div>
        <StatusBadge state={state} />
      </div>

      <div className="mt-4">
        <AllocationBar bps={state.currentAllocationBps} symbols={symbols} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Chip label="Share price" value={`$${formatWad(state.sharePrice)}`} />
        <Chip label="Total value" value={formatUsd(state.totalValue)} />
        <Chip label="Max drawdown" value={bpsToPct(state.mandate.maxDrawdownBps)} />
        <Chip label="Cooldown" value={formatCooldown(state.mandate.rebalanceCooldown)} />
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-mist-400">
        <span className="font-mono">{shortenAddress(state.address)}</span>
        <span>{state.epoch} decisions →</span>
      </div>
    </Card>
  )
}

function StatusBadge({ state }: { state: VaultEntry['state'] }) {
  if (state.killed) return <Badge tone="rose">Killed</Badge>
  if (state.tripped) return <Badge tone="amber">Tripped</Badge>
  return <Badge tone="green">Active</Badge>
}
