import { useEffect, useState } from 'react'
import type { Decision, Mandate } from '../lib/types'
import type { DecisionTca } from '../lib/fills-tca'
import { isConfidentialDecision } from '../lib/verify'
import {
  deriveDecisionFlow,
  type FlowLane,
  type FlowStage,
  type LaneKey,
  type StageState
} from '../lib/decision-flow'

const LANE_CLASS: Record<LaneKey, string> = {
  deliberation: 'mv-lane-deliberation',
  execution: 'mv-lane-execution',
  chain: 'mv-lane-chain'
}

const STATE_DOT: Record<StageState, string> = {
  ok: 'bg-accent-400',
  caged: 'bg-amber-soft',
  fallback: 'bg-rose-soft',
  held: 'bg-mist-400',
  info: 'bg-azure-400',
  locked: 'bg-violet-400'
}

/**
 * The centerpiece: a real decision flowing through the three engines, with the
 * "no LLM crosses this line" boundary made visible. DELIBERATION (LLM) decides
 * WHAT → boundary → EXECUTION (no LLM) decides HOW → ON-CHAIN enforces + records.
 */
export function DecisionFlow({
  decisions,
  mandate,
  symbols,
  tcaByTx
}: {
  decisions: readonly Decision[]
  mandate: Mandate
  symbols: readonly string[]
  tcaByTx: Map<string, DecisionTca>
}) {
  const [selected, setSelected] = useState(0)
  const [replayKey, setReplayKey] = useState(0)
  const [running, setRunning] = useState(true)

  // Auto-stop the running rail shimmer after the cascade settles.
  useEffect(() => {
    if (!running) return
    const t = setTimeout(() => setRunning(false), 2600)
    return () => clearTimeout(t)
  }, [running, replayKey])

  if (decisions.length === 0) return null
  const decision = decisions[Math.min(selected, decisions.length - 1)]!
  const tca = tcaByTx.get(decision.txHash.toLowerCase())
  const confidential = isConfidentialDecision(decision)
  const model = deriveDecisionFlow(decision, mandate, symbols, tca, confidential)

  const replay = () => {
    setRunning(true)
    setReplayKey((k) => k + 1)
  }

  // Global stage index for the top-to-bottom cascade.
  let gi = 0

  return (
    <section className="mv-elevated rounded-3xl border border-ink-700 p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-mist-100">How a decision flows</h2>
          <p className="mt-1 max-w-xl text-sm text-mist-400">
            Real on-chain decision <span className="font-mono text-mist-200">#{model.epoch}</span> through
            the three engines. The hot path never touches an LLM — and the chain proves it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              model.outcome.tone === 'good'
                ? 'bg-accent-500/15 text-accent-400 ring-1 ring-inset ring-accent-500/30'
                : model.outcome.tone === 'warn'
                  ? 'bg-rose-soft/15 text-rose-soft ring-1 ring-inset ring-rose-soft/30'
                  : 'bg-ink-700/60 text-mist-300 ring-1 ring-inset ring-ink-600'
            }`}
          >
            {model.outcome.label}
          </span>
          <button
            onClick={replay}
            className="rounded-full border border-ink-600 bg-ink-800/70 px-3 py-1 text-xs font-medium text-mist-200 transition-colors hover:border-ink-500 hover:text-mist-100"
          >
            ▶ Replay
          </button>
        </div>
      </div>

      {decisions.length > 1 ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-wider text-mist-500">epoch</span>
          {decisions.slice(0, 8).map((d, i) => (
            <button
              key={d.txHash}
              onClick={() => {
                setSelected(i)
                replay()
              }}
              className={`font-mono text-xs rounded-md px-2 py-1 transition-colors ${
                i === selected
                  ? 'bg-mist-100/10 text-mist-100 ring-1 ring-inset ring-mist-100/20'
                  : 'text-mist-400 hover:bg-ink-800/60 hover:text-mist-200'
              }`}
            >
              #{d.epoch}
            </button>
          ))}
        </div>
      ) : null}

      <div key={replayKey} className="mt-6 space-y-2">
        {model.lanes.map((lane, li) => {
          const laneEl = (
            <Lane lane={lane} running={running} startIndex={gi} key={lane.key} />
          )
          gi += lane.stages.length
          return (
            <div key={lane.key}>
              {laneEl}
              {li === 0 ? <Boundary /> : li < model.lanes.length - 1 ? <LaneGap /> : null}
            </div>
          )
        })}
      </div>

      <p className="mt-5 text-center text-xs text-mist-500">
        Off-chain clamp → reviewer veto → on-chain re-check → autonomous freeze. The LLM touches one
        stage; the rest is verified code.
      </p>
    </section>
  )
}

function Lane({ lane, running, startIndex }: { lane: FlowLane; running: boolean; startIndex: number }) {
  return (
    <div className={`mv-lane ${LANE_CLASS[lane.key]}`}>
      <div className="rounded-2xl border border-ink-700 bg-ink-900/40 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--lane)' }}
          >
            {lane.label}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              color: 'var(--lane)',
              background: 'color-mix(in oklab, var(--lane) 14%, transparent)',
              boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--lane) 30%, transparent)'
            }}
          >
            {lane.tag}
          </span>
          <span className="text-[11px] text-mist-500">{lane.caption}</span>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
          {lane.stages.map((stage, i) => (
            <div key={stage.id} className="flex flex-1 items-stretch gap-2">
              <StageNode stage={stage} index={startIndex + i} />
              {i < lane.stages.length - 1 ? <Connector running={running} index={startIndex + i} /> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StageNode({ stage, index }: { stage: FlowStage; index: number }) {
  return (
    <div
      className="mv-rise flex-1 rounded-xl border border-ink-700 bg-ink-850/80 px-3 py-2.5"
      style={{ ['--i' as string]: index }}
    >
      <div className="flex items-center justify-between">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
          style={{
            color: 'var(--lane)',
            background: 'color-mix(in oklab, var(--lane) 16%, transparent)',
            boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--lane) 35%, transparent)'
          }}
        >
          {stage.num}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[stage.state]}`} />
          <span className="text-[9px] font-medium uppercase tracking-wider text-mist-500">
            {stage.llm ? 'LLM' : 'det'}
          </span>
        </span>
      </div>
      <div className="mt-1.5 text-sm font-semibold text-mist-100">{stage.title}</div>
      <div className="mt-0.5 font-mono text-[11px] leading-snug text-mist-400">{stage.value}</div>
    </div>
  )
}

function Connector({ running, index }: { running: boolean; index: number }) {
  return (
    <div className="hidden w-6 shrink-0 items-center md:flex">
      <div
        className={`mv-flow-rail h-0.5 w-full rounded-full ${running ? 'is-running' : ''}`}
        style={{ ['--i' as string]: index }}
      />
    </div>
  )
}

/** The headline divider: nothing deliberative crosses into execution. */
function Boundary() {
  return (
    <div className="relative my-2 flex items-center justify-center">
      <div className="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-rose-soft/40 to-transparent" />
      <span className="relative rounded-full border border-rose-soft/30 bg-ink-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-rose-soft">
        ⊘ no LLM crosses this line
      </span>
    </div>
  )
}

function LaneGap() {
  return (
    <div className="flex justify-center py-1">
      <span className="text-mist-600">↓</span>
    </div>
  )
}
