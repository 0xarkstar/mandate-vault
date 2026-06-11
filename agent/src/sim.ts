import type { Address } from 'viem'
import { mandateVaultAbi, mockOracleAbi } from '@mandate-vault/abi'
import { makeClients, type Clients } from './chain.js'
import { readVaultState } from './feeds/vault.js'
import { decideOnce, type DecideOutcome } from './decide.js'
import { fetchFunding } from './feeds/funding.js'

/**
 * Accelerated simulation for AC-9: drives N decision cycles on a short-cooldown
 * demo vault, nudging the mMETH oracle price along a DETERMINISTIC path so runs
 * are reproducible. Between steps it polls until the cooldown elapses, with a
 * wall-clock guard so the process never hangs.
 */

const POLL_INTERVAL_MS = 5_000
const MAX_WALLCLOCK_MS = 30 * 60_000 // 30 min hard guard for the whole sim

/**
 * Deterministic mMETH price path (1e18). A bounded pseudo-random walk seeded by
 * `seed`, oscillating around `base`. Pure — unit-testable, identical every run.
 */
export function methPricePath(base: bigint, steps: number, seed = 1): bigint[] {
  const out: bigint[] = []
  // Simple LCG for reproducibility (no crypto needed — sim fixture, not security).
  let state = (seed >>> 0) || 1
  const next = (): number => {
    state = (1103515245 * state + 12345) & 0x7fffffff
    return state / 0x7fffffff // [0, 1)
  }
  let price = base
  for (let i = 0; i < steps; i++) {
    // +/- up to ~3% step, integer math on the 1e18-scaled price.
    const deltaBps = BigInt(Math.floor((next() - 0.5) * 600)) // [-300, +300] bps
    price = (price * (10_000n + deltaBps)) / 10_000n
    if (price < base / 2n) price = base / 2n // floor to keep the path sane
    out.push(price)
  }
  return out
}

export interface SimOptions {
  rpcUrl: string
  chainId: number
  agentKey: `0x${string}`
  vault: Address
  oracle: Address
  oracleOwnerKey?: `0x${string}`
  openRouterApiKey: string
  fundingSymbol: string
  steps: number
  seed?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Run the sim. Returns the list of decision outcomes (≥10 expected for AC-9).
 * Nudges the mMETH price (assets[1]) before each step when an oracle owner key
 * is provided; otherwise runs against whatever the live oracle reports.
 */
export async function runSim(opts: SimOptions): Promise<DecideOutcome[]> {
  const startedAt = Date.now()
  const clients = makeClients(opts.rpcUrl, opts.chainId, opts.agentKey)
  const oracleClients = opts.oracleOwnerKey
    ? makeClients(opts.rpcUrl, opts.chainId, opts.oracleOwnerKey)
    : undefined

  const initial = await readVaultState(clients.publicClient, opts.vault, opts.oracle)
  const methAsset = initial.mandate.assets[1]
  const basePrice = methAsset ? (initial.prices[methAsset.toLowerCase()] ?? 10n ** 18n) : 10n ** 18n
  const path = methPricePath(basePrice, opts.steps, opts.seed ?? 1)

  // Funding is fetched once and reused across the accelerated steps (real funding
  // moves on an 8h cadence; re-fetching every fast step is needless network load).
  const funding = await fetchFunding(opts.fundingSymbol)

  const outcomes: DecideOutcome[] = []

  // The previous demo scene may have rebalanced moments ago — respect the
  // on-chain cooldown before the FIRST step too, not only between steps.
  await waitForOnchainCooldown(clients, opts.vault, initial.mandate.rebalanceCooldown, startedAt)

  for (let i = 0; i < opts.steps; i++) {
    if (Date.now() - startedAt > MAX_WALLCLOCK_MS) {
      throw new Error('sim wall-clock guard exceeded')
    }

    // Nudge the mMETH oracle price along the deterministic path.
    if (oracleClients && methAsset) {
      await oracleClients.walletClient.writeContract({
        address: opts.oracle,
        abi: mockOracleAbi,
        functionName: 'setPrice',
        args: [methAsset, path[i]!],
        chain: oracleClients.chain,
        account: oracleClients.account
      })
    }

    const state = await readVaultState(clients.publicClient, opts.vault, opts.oracle)
    if (state.tripped) {
      // eslint-disable-next-line no-console -- CLI user-facing output
      console.log(`sim halted at step ${i}: vault tripped (drawdown breach).`)
      break
    }

    const outcome = await decideOnce({
      clients,
      vault: opts.vault,
      oracle: opts.oracle,
      openRouterApiKey: opts.openRouterApiKey,
      chainId: opts.chainId,
      fundingSymbol: opts.fundingSymbol,
      funding,
      vaultState: state
    })
    if (outcome.tripped) {
      // The rebalance tx tripped the drawdown protection — no decision was
      // logged, so it must not count toward AC-9.
      // eslint-disable-next-line no-console -- CLI user-facing output
      console.log(`sim halted at step ${i}: vault tripped during rebalance.`)
      break
    }
    outcomes.push(outcome)

    // Wait out the cooldown before the next on-chain rebalance (skip after last).
    if (i < opts.steps - 1) {
      const cooldownMs = state.mandate.rebalanceCooldown * 1000
      await waitForCooldownWindow(cooldownMs, startedAt)
    }
  }

  // eslint-disable-next-line no-console -- CLI user-facing output
  console.log(`sim complete: ${outcomes.length} decisions logged.`)
  return outcomes
}

/** Wait until the vault's on-chain cooldown (lastRebalance + cooldown) has passed. */
async function waitForOnchainCooldown(
  clients: Clients,
  vault: Address,
  cooldownSec: number,
  startedAt: number
): Promise<void> {
  const lastRebalance = (await clients.publicClient.readContract({
    address: vault,
    abi: mandateVaultAbi,
    functionName: 'lastRebalance'
  })) as bigint
  if (lastRebalance === 0n) return // first rebalance is cooldown-exempt
  const readyAtMs = (Number(lastRebalance) + cooldownSec + 1) * 1000
  while (Date.now() < readyAtMs) {
    if (Date.now() - startedAt > MAX_WALLCLOCK_MS) {
      throw new Error('sim wall-clock guard exceeded while waiting for on-chain cooldown')
    }
    await sleep(Math.min(POLL_INTERVAL_MS, readyAtMs - Date.now()))
  }
}

/** Sleep one cooldown window (+1s margin) with the wall-clock guard. */
async function waitForCooldownWindow(cooldownMs: number, startedAt: number): Promise<void> {
  const target = Date.now() + cooldownMs + 1000
  while (Date.now() < target) {
    if (Date.now() - startedAt > MAX_WALLCLOCK_MS) {
      throw new Error('sim wall-clock guard exceeded while waiting for cooldown')
    }
    await sleep(Math.min(POLL_INTERVAL_MS, target - Date.now()))
  }
}
