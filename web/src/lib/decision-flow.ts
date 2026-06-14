/**
 * Derive the 3-engine swimlane model for a single decision — the data behind
 * the DecisionFlow visualization. Pure: turns on-chain decision facts into the
 * staged pipeline (DELIBERATION → [no-LLM boundary] → EXECUTION → ON-CHAIN),
 * each stage carrying its real value. No rendering, no network.
 */
import type { Decision, Mandate } from './types'
import { bpsToPct } from './format'
import { computeClampDelta, extractRegime, extractTargetBps } from './clamp-delta'
import { extractSnapshotMeta } from './snapshot-meta'
import type { DecisionTca } from './fills-tca'

export type LaneKey = 'deliberation' | 'execution' | 'chain'
export type StageState = 'ok' | 'caged' | 'fallback' | 'held' | 'info' | 'locked'

export interface FlowStage {
  id: string
  num: number
  title: string
  /** One-line real value pulled from the decision. */
  value: string
  state: StageState
  /** True when an LLM touched this stage (drives the boundary + tags). */
  llm: boolean
}

export interface FlowLane {
  key: LaneKey
  label: string
  /** Short tag shown on the lane rail. */
  tag: string
  caption: string
  stages: FlowStage[]
}

export interface DecisionFlowModel {
  epoch: number
  confidential: boolean
  /** The headline outcome chip (e.g. "+4 bps vs mid" or "held"). */
  outcome: { label: string; tone: 'good' | 'neutral' | 'warn' }
  lanes: FlowLane[]
}

function fundingLine(snapshotJson: string, confidential: boolean): string {
  if (confidential) return '🔒 encrypted inputs'
  try {
    const o = JSON.parse(snapshotJson) as {
      funding?: { lastRate?: string; markPrice?: string }
      prices?: Record<string, unknown>
    }
    const n = o.prices ? Object.keys(o.prices).length : 0
    const rate = o.funding?.lastRate
    const ratePct = rate != null ? `${(Number(rate) * 100).toFixed(3)}%` : null
    return [ratePct ? `funding ${ratePct}` : null, n ? `${n} assets priced` : null]
      .filter(Boolean)
      .join(' · ') || 'market inputs captured'
  } catch {
    return 'market inputs captured'
  }
}

function allocSummary(bps: readonly number[], symbols: readonly string[]): string {
  const parts = bps.map((b, i) => `${symbols[i] ?? `a${i}`} ${bpsToPct(b)}`)
  return parts.length <= 3 ? parts.join(' / ') : `${parts.slice(0, 3).join(' / ')}…`
}

/** Build the full flow model from a decision. */
export function deriveDecisionFlow(
  decision: Decision,
  mandate: Mandate,
  symbols: readonly string[],
  tca: DecisionTca | undefined,
  confidential: boolean
): DecisionFlowModel {
  const regime = extractRegime(decision.rawProposalJson)
  const rawBps = extractTargetBps(decision.rawProposalJson)
  const delta = computeClampDelta(rawBps, decision.clampedAllocBps)
  const meta = extractSnapshotMeta(decision.snapshotJson)
  const caged = delta.anyChanged
  const fills = tca?.fillCount ?? 0
  const improved = tca?.avgImprovementBps ?? 0
  const hasFill = fills > 0

  const proposeValue = confidential
    ? '🔒 confidential'
    : regime
      ? `${regime.replace('_', ' ')} · ${rawBps.length ? allocSummary(rawBps, symbols) : 'proposal'}`
      : meta.llmFallback
        ? 'deterministic hold'
        : 'proposal recorded'

  const outcome: DecisionFlowModel['outcome'] = hasFill
    ? {
        label: `${improved >= 0 ? '+' : ''}${improved.toFixed(1)} bps vs mid`,
        tone: improved >= 0 ? 'good' : 'warn'
      }
    : { label: caged ? 'caged · settled' : 'held / on-target', tone: 'neutral' }

  const deliberation: FlowLane = {
    key: 'deliberation',
    label: 'Deliberation',
    tag: 'LLM',
    caption: 'decides WHAT — slow, may resolve to no action',
    stages: [
      {
        id: 'snapshot',
        num: 1,
        title: 'Snapshot',
        value: fundingLine(decision.snapshotJson, confidential),
        state: confidential ? 'locked' : 'info',
        llm: false
      },
      {
        id: 'propose',
        num: 2,
        title: 'Propose',
        value: proposeValue,
        state: meta.llmFallback ? 'fallback' : confidential ? 'locked' : 'info',
        llm: !meta.llmFallback
      },
      {
        id: 'review',
        num: 3,
        title: 'Review',
        value: meta.llmFallback ? 'deterministic check' : 'different model · adversarial',
        state: 'ok',
        llm: !meta.llmFallback
      },
      {
        id: 'gate',
        num: 4,
        title: 'Gate',
        value: 'resolved → ACT',
        state: 'ok',
        llm: false
      }
    ]
  }

  const execution: FlowLane = {
    key: 'execution',
    label: 'Execution',
    tag: 'NO LLM',
    caption: 'decides HOW — deterministic, milliseconds',
    stages: [
      {
        id: 'clamp',
        num: 5,
        title: 'Clamp',
        value: caged ? 'pulled inside mandate' : 'already within bounds',
        state: caged ? 'caged' : 'ok',
        llm: false
      },
      {
        id: 'rfq',
        num: 6,
        title: 'RFQ quotes',
        value: hasFill ? `best of signed quotes` : 'no swap leg (hold)',
        state: hasFill ? 'info' : 'held',
        llm: false
      },
      {
        id: 'slippage',
        num: 7,
        title: 'Slippage gate',
        value: hasFill ? 'within bound → fill' : 'no fill',
        state: hasFill ? 'ok' : 'held',
        llm: false
      }
    ]
  }

  const chain: FlowLane = {
    key: 'chain',
    label: 'On-chain',
    tag: 'SETTLED',
    caption: 'enforced + recorded — anyone can replay',
    stages: [
      {
        id: 'recheck',
        num: 8,
        title: 'Mandate re-check',
        value: `bounds re-verified · ${allocSummary(decision.clampedAllocBps, symbols)}`,
        state: 'ok',
        llm: false
      },
      {
        id: 'settle',
        num: 9,
        title: 'Settle',
        value: hasFill
          ? `atomic fill · ${improved >= 0 ? '+' : ''}${improved.toFixed(1)} bps TCA`
          : 'positions held',
        state: hasFill ? 'ok' : 'held',
        llm: false
      },
      {
        id: 'logged',
        num: 10,
        title: 'Logged',
        value: 'DecisionLogged → Verify ✓',
        state: 'ok',
        llm: false
      }
    ]
  }

  void mandate
  return { epoch: decision.epoch, confidential, outcome, lanes: [deliberation, execution, chain] }
}
