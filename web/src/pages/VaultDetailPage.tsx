import { useVaultDetail } from '../hooks/useVaultDetail'
import { navigate } from '../lib/router'
import { extractPlaybookVersion } from '../lib/snapshot-meta'
import { AllocationBar } from '../components/AllocationBar'
import { MandateCard } from '../components/MandateCard'
import { VaultHeader } from '../components/VaultHeader'
import { DecisionTimeline } from '../components/DecisionTimeline'
import { DepositPanel } from '../components/DepositPanel'
import { PlaybookCard } from '../components/PlaybookCard'
import { SeparationOfPowersCard } from '../components/SeparationOfPowersCard'
import { RunwayCard } from '../components/RunwayCard'
import { Card, SectionTitle } from '../components/ui/Card'

export function VaultDetailPage({ address }: { address: `0x${string}` }) {
  const { loading, error, state, symbols, decisions, fills, decisionsLoading, reload } =
    useVaultDetail(address)

  const playbookVersion = decisions[0] ? extractPlaybookVersion(decisions[0].snapshotJson) : null

  return (
    <div>
      <button
        onClick={() => navigate({ name: 'vaults' })}
        className="mb-6 text-xs font-medium text-mist-400 hover:text-mist-200"
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

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <MandateCard mandate={state.mandate} symbols={symbols} currentBps={state.currentAllocationBps} />

              <Card className="p-5">
                <SectionTitle sub="Live on-chain holdings, oracle-priced.">Current allocation</SectionTitle>
                <AllocationBar bps={state.currentAllocationBps} symbols={symbols} height={18} />
              </Card>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <PlaybookCard version={playbookVersion} />
                <SeparationOfPowersCard />
              </div>
            </div>

            <div className="space-y-6 lg:col-span-1">
              <DepositPanel state={state} onAction={reload} />
              <RunwayCard state={state} safeSymbol={symbols[0] ?? 'mUSD'} />
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
