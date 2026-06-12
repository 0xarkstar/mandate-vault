import { useState } from 'react'
import type { VaultState } from '../lib/types'
import { computeRunway } from '../lib/runway'
import { formatUsd } from '../lib/format'
import { Card, SectionTitle } from './ui/Card'

/**
 * Treasury runway: the safe-asset sleeve divided by a user-entered monthly burn.
 * Safe sleeve = total value × the safe asset's current allocation share. Burn is
 * held in component state only (never persisted on-chain).
 */
export function RunwayCard({ state, safeSymbol }: { state: VaultState; safeSymbol: string }) {
  const [burn, setBurn] = useState('')

  const safeBps = state.currentAllocationBps[0] ?? 0
  const safeSleeve = (state.totalValue * BigInt(safeBps)) / 10_000n
  const runway = computeRunway(safeSleeve, burn)

  return (
    <Card className="p-5">
      <SectionTitle sub={`Safe-asset sleeve (${safeSymbol}) ÷ your monthly burn.`}>Runway</SectionTitle>

      <div className="mb-4 grid grid-cols-2 gap-3 text-xs">
        <Stat label={`Safe sleeve (${safeSymbol})`} value={formatUsd(safeSleeve)} />
        <Stat label="Runway" value={runway.label} />
      </div>

      <label className="mb-1 block text-[11px] uppercase tracking-wider text-mist-400">
        Monthly burn (mUSD)
      </label>
      <input
        value={burn}
        onChange={(e) => setBurn(e.target.value.replace(/[^0-9.]/g, ''))}
        inputMode="decimal"
        placeholder="e.g. 5000"
        className="w-full rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 font-mono text-sm text-mist-100 outline-none focus:border-azure-500"
      />
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-mist-400">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-mist-100">{value}</div>
    </div>
  )
}
