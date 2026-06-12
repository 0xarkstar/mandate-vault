import type { Address, PublicClient } from 'viem'
import { parseAbiItem, parseEventLogs } from 'viem'
import { ProposalSchema, SnapshotSchema } from '@mandate-vault/clamp-core'
import { QUOTE_FILLED_EVENT } from '../execute/submit.js'

/**
 * LEARNING engine, distillation pass (Kepano rewrite over the Karpathy
 * append-only log): read the on-chain decision history — the append-only
 * source of truth — and distill it into small per-regime execution stats.
 * Runs in the background clock (minutes–hours); NEVER on the hot path.
 */

const DECISION_LOGGED = parseAbiItem(
  'event DecisionLogged(uint64 indexed epoch, bytes32 inputSnapshotHash, bytes32 rawProposalHash, uint16[] clampedAllocBps, bytes32 rationaleHash)'
)
const DECISION_DATA = parseAbiItem('event DecisionData(uint64 indexed epoch, string snapshotJson, string rawProposalJson, string rationale)')

/** One decision, joined across DecisionLogged/DecisionData/QuoteFilled. */
export interface DecisionRecord {
  epoch: number
  regime: string
  rawBps: number[]
  clampedBps: number[]
  cageHit: boolean
  llmFallback: boolean
  playbookVersion: number
  /** TCA improvement bps of fills in the same tx (RFQ decisions only). */
  fillImprovementsBps: number[]
  blockNumber: bigint
}

export interface RegimeStats {
  decisions: number
  cageHits: number
  fallbacks: number
  fills: number
  /** Mean fill improvement vs oracle mid (bps; positive = better than mid). */
  avgImprovementBps: number
  worstImprovementBps: number
}

/** Pure distillation: records → per-regime stats. */
export function distillDecisions(records: DecisionRecord[]): Record<string, RegimeStats> {
  const out: Record<string, RegimeStats> = {}
  for (const r of records) {
    const prev = out[r.regime] ?? {
      decisions: 0,
      cageHits: 0,
      fallbacks: 0,
      fills: 0,
      avgImprovementBps: 0,
      worstImprovementBps: 0
    }
    const fillSum = prev.avgImprovementBps * prev.fills + r.fillImprovementsBps.reduce((a, b) => a + b, 0)
    const fills = prev.fills + r.fillImprovementsBps.length
    out[r.regime] = {
      decisions: prev.decisions + 1,
      cageHits: prev.cageHits + (r.cageHit ? 1 : 0),
      fallbacks: prev.fallbacks + (r.llmFallback ? 1 : 0),
      fills,
      avgImprovementBps: fills === 0 ? 0 : Math.round((fillSum / fills) * 100) / 100,
      worstImprovementBps: Math.min(prev.worstImprovementBps, ...r.fillImprovementsBps)
    }
  }
  return out
}

export interface FetchRecordsOptions {
  vault: Address
  /** RFQ venue for TCA joins; omit to skip fill stats. */
  venue?: Address
  fromBlock?: bigint
  toBlock?: bigint
}

/** Read + join the on-chain decision log into DecisionRecords. */
export async function fetchDecisionRecords(
  publicClient: PublicClient,
  opts: FetchRecordsOptions
): Promise<DecisionRecord[]> {
  const range = { fromBlock: opts.fromBlock ?? 0n, toBlock: opts.toBlock ?? ('latest' as const) }

  const [loggedRaw, dataRaw, fillsRaw] = await Promise.all([
    publicClient.getLogs({ address: opts.vault, event: DECISION_LOGGED, ...range }),
    publicClient.getLogs({ address: opts.vault, event: DECISION_DATA, ...range }),
    opts.venue
      ? publicClient.getLogs({ address: opts.venue, event: QUOTE_FILLED_EVENT, ...range })
      : Promise.resolve([])
  ])

  const logged = parseEventLogs({ abi: [DECISION_LOGGED], logs: loggedRaw })
  const data = parseEventLogs({ abi: [DECISION_DATA], logs: dataRaw })
  const fills = parseEventLogs({ abi: [QUOTE_FILLED_EVENT], logs: fillsRaw })

  const clampedByEpoch = new Map<number, { clamped: number[]; tx: string; block: bigint }>()
  for (const l of logged) {
    clampedByEpoch.set(Number(l.args.epoch), {
      clamped: [...l.args.clampedAllocBps],
      tx: l.transactionHash,
      block: l.blockNumber
    })
  }

  const fillsByTx = new Map<string, number[]>()
  for (const f of fills) {
    const list = fillsByTx.get(f.transactionHash) ?? []
    fillsByTx.set(f.transactionHash, [...list, Number(f.args.improvementBps)])
  }

  const records: DecisionRecord[] = []
  for (const d of data) {
    const epoch = Number(d.args.epoch)
    const joined = clampedByEpoch.get(epoch)
    if (!joined) continue

    const proposal = ProposalSchema.safeParse(JSON.parse(d.args.rawProposalJson))
    const snapshot = SnapshotSchema.safeParse(JSON.parse(d.args.snapshotJson))
    if (!proposal.success || !snapshot.success) continue

    const rawBps = proposal.data.targetAllocBps
    records.push({
      epoch,
      regime: proposal.data.regime,
      rawBps,
      clampedBps: joined.clamped,
      cageHit: rawBps.length !== joined.clamped.length || rawBps.some((b, i) => b !== joined.clamped[i]),
      llmFallback: snapshot.data.llmFallback === true,
      playbookVersion: snapshot.data.playbookVersion ?? 0,
      fillImprovementsBps: fillsByTx.get(joined.tx) ?? [],
      blockNumber: joined.block
    })
  }

  return records.sort((a, b) => a.epoch - b.epoch)
}
