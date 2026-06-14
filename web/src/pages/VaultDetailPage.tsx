import { useMemo } from 'react'
import { useVaultDetail } from '../hooks/useVaultDetail'
import { navigate } from '../lib/router'
import { extractPlaybookVersion } from '../lib/snapshot-meta'
import { indexTcaByTx } from '../lib/fills-tca'
import { AllocationBar } from '../components/AllocationBar'
import { MandateCard } from '../components/MandateCard'
import { VaultHeader } from '../components/VaultHeader'
import { DecisionFlow } from '../components/DecisionFlow'
import { DecisionTimeline } from '../components/DecisionTimeline'
import { DepositPanel } from '../components/DepositPanel'
import { PlaybookCard } from '../components/PlaybookCard'
import { RunwayCard } from '../components/RunwayCard'
import { Card, SectionTitle } from '../components/ui/Card'

export function VaultDetailPage({ address }: { address: `0x${string}` }) {
  const { loading, error, state, symbols, decisions, fills, decisionsLoading, reload } =
    useVaultDetail(address)

  const playbookVersion = decisions[0] ? extractPlaybookVersion(decisions[0].snapshotJson) : null
  const tcaByTx = useMemo(() => indexTcaByTx(fills), [fills])

  return (
    <div className="mv-fade-in">
      <button
        onClick={() => navigate({ name: 'vaults' })}
        className="mb-6 text-xs font-medium text-mist-400 transition-colors hover:text-mist-200"
      >
        ← All vaults
      </button>

      {loading ? (
        <div className="h-48 animate-pulse rounded-2xl border border-ink-700 bg-ink-850/50" />
      ) : error || !state ? (
        <Card className="p-6">
          <p className="text-sm text-rose-soft">{error ?? 'Vault not found.'}</p>
        </Card>
      ) : (
        <>
          <VaultHeader state={state} symbols={symbols} />

          {decisions.length > 0 ? (
            <div className="mt-8">
              <DecisionFlow decisions={decisions} mandate={state.mandate} symbols={symbols} tcaByTx={tcaByTx} />
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <MandateCard mandate={state.mandate} symbols={symbols} currentBps={state.currentAllocationBps} />

              <Card className="p-5">
                <SectionTitle sub="Live on-chain holdings, oracle-priced.">Current allocation</SectionTitle>
                <AllocationBar bps={state.currentAllocationBps} symbols={symbols} height={18} />
              </Card>
            </div>

            <div className="space-y-6 lg:col-span-1">
              <DepositPanel state={state} onAction={reload} />
              <RunwayCard state={state} safeSymbol={symbols[0] ?? 'mUSD'} />
              <PlaybookCard version={playbookVersion} />
            </div>
          </div>

          <div className="mt-10">
            <DecisionTimeline
              decisions={decisions}
              fills={fills}
              loading={decisionsLoading}
              mandate={state.mandate}
              symbols={symbols}
            />
          </div>
        </>
      )}
    </div>
  )
}
