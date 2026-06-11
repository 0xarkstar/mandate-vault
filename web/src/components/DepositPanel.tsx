import { useState } from 'react'
import { parseUnits } from 'viem'
import type { VaultState } from '../lib/types'
import { useWallet } from '../wallet/WalletContext'
import { usePosition } from '../hooks/usePosition'
import { approveToken, depositToVault, mintToken, withdrawFromVault } from '../chain/writes'
import { formatUsd, formatWad } from '../lib/format'
import { Card, SectionTitle } from './ui/Card'
import { Button } from './ui/Button'

const FAUCET_AMOUNT = parseUnits('10000', 18)

type Pending = null | 'mint' | 'approve' | 'deposit' | 'withdraw'

export function DepositPanel({ state, onAction }: { state: VaultState; onAction: () => void }) {
  const wallet = useWallet()
  const { position, reload: reloadPosition } = usePosition(state, wallet.account)
  const [amount, setAmount] = useState('100')
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<string | null>(null)

  const safe = state.mandate.assets[0]
  const sharePriceLabel = `$${formatWad(state.sharePrice)}`

  const refresh = () => {
    reloadPosition()
    onAction()
  }

  const parsedAmount = (() => {
    try {
      return parseUnits(amount || '0', 18)
    } catch {
      return 0n
    }
  })()

  const needsApproval = position !== null && position.allowance < parsedAmount
  const readOnly = !wallet.available

  const guard = async (kind: Pending, fn: () => Promise<unknown>) => {
    if (!wallet.client || !wallet.account) return
    setPending(kind)
    setError(null)
    try {
      await fn()
      refresh()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setPending(null)
    }
  }

  const userShareValue =
    position && state.totalShares > 0n
      ? (position.shares * state.sharePrice) / 10n ** 18n
      : 0n

  return (
    <Card className="p-5">
      <SectionTitle sub="Deposit the safe asset (mUSD) for shares. Testnet faucet is open.">
        Deposit / Withdraw
      </SectionTitle>

      {readOnly ? (
        <div className="rounded-lg border border-ink-700 bg-ink-900/50 p-4 text-sm text-mist-300">
          Read-only mode — no browser wallet detected. Connect an injected wallet to mint test funds, deposit
          and withdraw. All dashboard data above is live without a wallet.
        </div>
      ) : !wallet.account ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-mist-300">Connect a wallet on Mantle Sepolia to interact.</p>
          <Button onClick={() => void wallet.connect()} disabled={wallet.connecting}>
            {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
          </Button>
          {wallet.error ? <p className="text-xs text-rose-soft">{wallet.error}</p> : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Position label="Your shares" value={formatWad(position?.shares ?? 0n)} />
            <Position label="Share value" value={formatUsd(userShareValue)} />
            <Position label="Wallet mUSD" value={formatWad(position?.safeBalance ?? 0n)} />
            <Position label="Share price" value={sharePriceLabel} />
          </div>

          <Button
            variant="secondary"
            onClick={() =>
              safe && void guard('mint', () => mintToken(wallet.client!, safe, wallet.account!, FAUCET_AMOUNT))
            }
            disabled={pending !== null || !safe}
          >
            {pending === 'mint' ? 'Minting…' : '🚰 Faucet: mint 10,000 mUSD'}
          </Button>

          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-mist-400">
              Amount (mUSD)
            </label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              className="w-full rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 font-mono text-sm text-mist-100 outline-none focus:border-azure-500"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {needsApproval ? (
              <Button
                onClick={() =>
                  safe &&
                  void guard('approve', () =>
                    approveToken(wallet.client!, safe, wallet.account!, state.address, parsedAmount)
                  )
                }
                disabled={pending !== null || parsedAmount === 0n}
              >
                {pending === 'approve' ? 'Approving…' : 'Approve'}
              </Button>
            ) : (
              <Button
                onClick={() =>
                  void guard('deposit', () =>
                    depositToVault(wallet.client!, state.address, wallet.account!, parsedAmount)
                  )
                }
                disabled={pending !== null || parsedAmount === 0n || state.killed}
              >
                {pending === 'deposit' ? 'Depositing…' : 'Deposit'}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() =>
                void guard('withdraw', () =>
                  withdrawFromVault(wallet.client!, state.address, wallet.account!, parsedAmount)
                )
              }
              disabled={pending !== null || parsedAmount === 0n || (position?.shares ?? 0n) === 0n}
            >
              {pending === 'withdraw' ? 'Withdrawing…' : 'Withdraw shares'}
            </Button>
          </div>

          {state.killed ? (
            <p className="text-xs text-rose-soft">Vault is killed — withdrawals only.</p>
          ) : null}
          {error ? <p className="text-xs text-rose-soft">{error}</p> : null}
        </div>
      )}
    </Card>
  )
}

function Position({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-mist-400">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-mist-100">{value}</div>
    </div>
  )
}

function extractError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message
    const short = msg.split('\n')[0] ?? msg
    return short.length > 160 ? `${short.slice(0, 157)}…` : short
  }
  return 'Transaction failed'
}
