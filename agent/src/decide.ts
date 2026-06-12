import { canonicalJson, clamp, fallbackAllocation, hashString, type Proposal } from '@mandate-vault/clamp-core'
import { mandateVaultAbi } from '@mandate-vault/abi'
import type { Address } from 'viem'
import { BaseError, ContractFunctionRevertedError, parseAbiItem, parseEventLogs } from 'viem'

const DECISION_LOGGED_EVENT = parseAbiItem(
  'event DecisionLogged(uint64 indexed epoch, bytes32 inputSnapshotHash, bytes32 rawProposalHash, uint16[] clampedAllocBps, bytes32 rationaleHash)'
)
import type { Clients } from './chain.js'
import { fetchFunding, type FundingSnapshot } from './feeds/funding.js'
import { readVaultState, type VaultState } from './feeds/vault.js'
import { buildSnapshot } from './snapshot.js'
import { proposeAllocation, FALLBACK_RATIONALE } from './deliberate/propose.js'
import { reviewProposal } from './deliberate/review.js'
import { gateDecision } from './deliberate/gate.js'
import type { Verdict } from './deliberate/types.js'
import { buildViolateTarget } from './violate.js'
import { planRfqExecution, postPickedQuotes, parseFills, type Fill, type RfqConfig } from './execute/submit.js'

/**
 * One decision cycle: collect inputs → LLM proposes → clamp-core cages →
 * submit rebalance() on-chain. The `--violate` path deliberately bypasses the
 * clamp to prove the on-chain re-check reverts (demo scene 1).
 */

export interface DecideOptions {
  clients: Clients
  vault: Address
  oracle: Address
  openRouterApiKey: string
  chainId: number
  fundingSymbol: string
  /** When true: skip the clamp, submit a raw out-of-bounds target, expect revert. */
  violate?: boolean
  /**
   * Operator-forced allocation (demo setup). Bypasses the LLM only — the
   * snapshot, clamp and on-chain submission run through the normal pipeline,
   * so the resulting epoch verifies like any other decision.
   */
  forceTarget?: number[]
  /** Optional injected funding (sim uses cached/synthetic funding). */
  funding?: FundingSnapshot
  /** Optional pre-read vault state (sim avoids a double read). */
  vaultState?: VaultState
  /** RFQ execution config — when set, fills route through posted MM quotes. */
  rfq?: RfqConfig
}

export interface DecideOutcome {
  epoch: bigint
  regime: string
  rawBps: number[]
  clampedBps: number[]
  violations: number
  txHash?: `0x${string}`
  /** Set when --violate produced the expected on-chain revert. */
  reverted?: boolean
  revertMessage?: string
  /** Set when the rebalance tx triggered the drawdown trip instead of logging a decision. */
  tripped?: boolean
  llmFallback: boolean
  /** Set when the RFQ slippage gate froze the cycle — no fill was attempted. */
  held?: boolean
  holdReason?: string
  /** TCA: RFQ fills (fill vs oracle mid) recorded by the venue. */
  fills?: Fill[]
  /** Reviewer verdict (proposer ≠ reviewer) and which model reviewed. */
  review?: { verdict: Verdict; reviewer: string }
}

function logLine(o: DecideOutcome): string {
  const arrow = `${JSON.stringify(o.rawBps)}→${JSON.stringify(o.clampedBps)}`
  const tx = o.txHash ?? (o.reverted ? 'REVERTED' : 'none')
  return `epoch=${o.epoch} regime=${o.regime} ${arrow} violations=${o.violations} fallback=${o.llmFallback} tx=${tx}`
}

/**
 * Decode a viem contract revert into a human-readable line. Recognises the
 * MandateViolation custom error so scene 1 prints the offending bound clearly.
 */
function describeRevert(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? reverted.reason ?? 'revert'
      const args = reverted.data?.args
      if (name === 'MandateViolation' && Array.isArray(args)) {
        const [idx, target, min, max] = args as [bigint, number, number, number]
        return `MandateViolation: asset[${idx}] target=${target}bps outside [${min}, ${max}]`
      }
      return `revert: ${name}${args ? ` ${JSON.stringify(args.map(String))}` : ''}`
    }
    return err.shortMessage
  }
  return String(err)
}

export async function decideOnce(opts: DecideOptions): Promise<DecideOutcome> {
  const { clients, vault, oracle, openRouterApiKey, chainId, fundingSymbol, violate } = opts

  const vaultState = opts.vaultState ?? (await readVaultState(clients.publicClient, vault, oracle))
  const funding = opts.funding ?? (await fetchFunding(fundingSymbol))
  const mandate = vaultState.mandate
  const bounds = { minBps: mandate.minBps, maxBps: mandate.maxBps }

  // Proposal source: operator-forced (demo setup) > LLM > deterministic fallback.
  let proposal: Proposal
  let llmFallback = false
  let proposerModel: string | null = null
  if (opts.forceTarget) {
    proposal = {
      regime: 'RISK_ON',
      targetAllocBps: opts.forceTarget,
      rationale: 'operator-forced allocation (demo setup): deterministic positioning ahead of the drawdown demonstration'
    }
  } else {
    const llm = await proposeAllocation(
      buildSnapshot({ chainId, vault, ts: Math.floor(Date.now() / 1000), funding, vaultState, llmFallback: false }),
      mandate,
      openRouterApiKey
    )
    llmFallback = llm === null
    proposerModel = llm?.model ?? null
    proposal = llm
      ? llm.proposal
      : {
          regime: 'NEUTRAL',
          targetAllocBps: fallbackAllocation(vaultState.allocBps, bounds),
          rationale: FALLBACK_RATIONALE
        }
  }

  // The snapshot recorded on-chain must carry the real llmFallback flag.
  const snapshot = buildSnapshot({
    chainId,
    vault,
    ts: Math.floor(Date.now() / 1000),
    funding,
    vaultState,
    llmFallback
  })
  const snapshotJson = canonicalJson(snapshot)
  const rawProposalJson = canonicalJson(proposal)

  if (violate) {
    return submitViolation({ opts, proposal, snapshotJson, rawProposalJson, assetCount: mandate.assets.length, epoch: vaultState.epoch })
  }

  // ---- DELIBERATION: adversarial review (different model) + deterministic
  // gate, ONE pass, default HOLD. Operator-forced targets are demo scaffolding,
  // not model output — they bypass review but never the clamp or the chain.
  const review = opts.forceTarget
    ? { verdict: { verdict: 'approved', reason: 'operator-forced demo path — review bypassed' } as Verdict, reviewer: 'none' }
    : await reviewProposal({ proposal, snapshot, mandate, apiKey: openRouterApiKey, proposerModel })

  const gate = gateDecision({
    vault,
    proposal,
    verdict: review.verdict,
    maxSlippageBps: opts.rfq?.maxSlippageBps ?? 50,
    playbookVersion: 0,
    snapshotHash: hashString(snapshotJson)
  })
  if (gate.action === 'hold') {
    const outcome: DecideOutcome = {
      epoch: vaultState.epoch,
      regime: proposal.regime,
      rawBps: proposal.targetAllocBps,
      clampedBps: [],
      violations: 0,
      llmFallback,
      held: true,
      holdReason: gate.reason,
      review
    }
    // eslint-disable-next-line no-console -- CLI user-facing output
    console.log(`deliberation HELD this cycle (no action, funds untouched): ${gate.reason}`)
    return outcome
  }

  const { clampedBps, violations } = clamp(gate.intent.targetAllocBps, bounds)

  // ---- EXECUTION engine (no LLM from here on) ----
  // RFQ: compute legs, collect signed MM quotes, gate on slippage, post the
  // winners so the vault's rebalance() consumes them atomically.
  if (opts.rfq) {
    const plan = await planRfqExecution(opts.rfq, chainId, vaultState, clampedBps)
    if (plan.action === 'freeze') {
      const outcome: DecideOutcome = {
        epoch: vaultState.epoch,
        regime: proposal.regime,
        rawBps: proposal.targetAllocBps,
        clampedBps,
        violations: violations.length,
        llmFallback,
        held: true,
        holdReason: plan.reason
      }
      // eslint-disable-next-line no-console -- CLI user-facing output
      console.log(`slippage gate FROZE this cycle — no fill attempted. ${plan.reason}`)
      return outcome
    }
    await postPickedQuotes(clients, opts.rfq.venue, plan.plans)
    for (const p of plan.plans) {
      // eslint-disable-next-line no-console -- CLI user-facing output
      console.log(
        p.pick
          ? `leg ${p.leg.assetIn}→${p.leg.assetOut} amountIn=${p.leg.amountIn} quote=${p.pick.mmName} (${p.slippageBps}bps vs mid)`
          : `leg ${p.leg.assetIn}→${p.leg.assetOut} amountIn=${p.leg.amountIn} no valid quote — oracle-mid fallback`
      )
    }
  }

  const txHash = await clients.walletClient.writeContract({
    address: vault,
    abi: mandateVaultAbi,
    functionName: 'rebalance',
    args: [clampedBps, snapshotJson, rawProposalJson, proposal.rationale],
    chain: clients.chain,
    account: clients.account
  })
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash })

  // The contract trips (and returns WITHOUT logging a decision) when the
  // drawdown floor is breached — never assume the epoch advanced.
  const decisions = parseEventLogs({ abi: [DECISION_LOGGED_EVENT], logs: receipt.logs })
  const decision = decisions[0]

  if (!decision) {
    const outcome: DecideOutcome = {
      epoch: vaultState.epoch,
      regime: proposal.regime,
      rawBps: proposal.targetAllocBps,
      clampedBps,
      violations: violations.length,
      txHash,
      tripped: true,
      llmFallback
    }
    // eslint-disable-next-line no-console -- CLI user-facing output
    console.log(`drawdown trip during rebalance — decision NOT logged; vault de-risked, agent suspended. tx=${txHash}`)
    return outcome
  }

  const fills = opts.rfq ? parseFills(receipt) : []
  const outcome: DecideOutcome = {
    epoch: decision.args.epoch,
    regime: proposal.regime,
    rawBps: proposal.targetAllocBps,
    clampedBps,
    violations: violations.length,
    txHash,
    llmFallback,
    review,
    ...(fills.length > 0 ? { fills } : {})
  }
  // eslint-disable-next-line no-console -- CLI user-facing output
  console.log(logLine(outcome))
  for (const f of fills) {
    // eslint-disable-next-line no-console -- CLI user-facing output
    console.log(`  TCA fill mm=${f.mm} ${f.amountIn}→${f.amountOut} (mid ${f.oracleMidOut}, ${f.improvementBps >= 0 ? '+' : ''}${f.improvementBps}bps)`)
  }
  return outcome
}

interface ViolationArgs {
  opts: DecideOptions
  proposal: Proposal
  snapshotJson: string
  rawProposalJson: string
  assetCount: number
  epoch: bigint
}

/**
 * Scene 1: skip the clamp, submit an intentionally out-of-bounds target, and
 * expect the on-chain re-check to revert. Catch + describe the revert and treat
 * it as success (the cage held).
 */
async function submitViolation(a: ViolationArgs): Promise<DecideOutcome> {
  const { opts, proposal, snapshotJson, rawProposalJson, assetCount, epoch } = a
  const rawTarget = buildViolateTarget(assetCount)

  try {
    const txHash = await opts.clients.walletClient.writeContract({
      address: opts.vault,
      abi: mandateVaultAbi,
      functionName: 'rebalance',
      args: [rawTarget, snapshotJson, rawProposalJson, proposal.rationale],
      chain: opts.clients.chain,
      account: opts.clients.account
    })
    await opts.clients.publicClient.waitForTransactionReceipt({ hash: txHash })
    // Reaching here means the cage FAILED — surface it loudly.
    const outcome: DecideOutcome = {
      epoch: epoch + 1n,
      regime: proposal.regime,
      rawBps: rawTarget,
      clampedBps: rawTarget,
      violations: 0,
      txHash,
      reverted: false,
      llmFallback: false
    }
    // eslint-disable-next-line no-console -- CLI user-facing output
    console.error(`UNEXPECTED: out-of-bounds target was accepted on-chain — cage breached! ${logLine(outcome)}`)
    return outcome
  } catch (err) {
    const message = describeRevert(err)
    const outcome: DecideOutcome = {
      epoch,
      regime: proposal.regime,
      rawBps: rawTarget,
      clampedBps: rawTarget,
      violations: 1,
      reverted: true,
      revertMessage: message,
      llmFallback: false
    }
    // eslint-disable-next-line no-console -- CLI user-facing output
    console.log(`cage held — out-of-bounds rebalance reverted on-chain:\n  ${message}\n  ${logLine(outcome)}`)
    return outcome
  }
}
