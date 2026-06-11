import { decodeEventLog, type Log } from 'viem'
import { mandateVaultAbi } from '@mandate-vault/abi'
import { publicClient } from './clients'
import type { Decision } from '../lib/types'

const vaultAbi = mandateVaultAbi as never

/**
 * Fetch a vault's decision timeline by reconstructing it from DecisionLogged
 * (hashes + clamped alloc) and DecisionData (full JSON payloads). The two are
 * joined on the indexed `epoch`.
 *
 * Some RPCs cap `eth_getLogs` block ranges, so we try a single wide query first
 * and fall back to chunked scanning on failure. Newest decisions come first.
 */
export async function fetchDecisions(vault: `0x${string}`): Promise<Decision[]> {
  const latest = await publicClient.getBlockNumber()
  const [loggedLogs, dataLogs] = await Promise.all([
    getLogsResilient(vault, 'DecisionLogged', latest),
    getLogsResilient(vault, 'DecisionData', latest)
  ])

  const dataByEpoch = new Map<number, DecodedData>()
  for (const log of dataLogs) {
    const decoded = decodeDataLog(log)
    if (decoded) dataByEpoch.set(decoded.epoch, decoded)
  }

  const blockNumbers = new Set<bigint>()
  for (const log of loggedLogs) {
    if (log.blockNumber !== null) blockNumbers.add(log.blockNumber)
  }
  const timestamps = await fetchBlockTimestamps([...blockNumbers])

  const decisions: Decision[] = []
  for (const log of loggedLogs) {
    const logged = decodeLoggedLog(log)
    if (!logged) continue
    const data = dataByEpoch.get(logged.epoch)
    decisions.push({
      epoch: logged.epoch,
      txHash: (log.transactionHash ?? '0x') as `0x${string}`,
      blockNumber: log.blockNumber ?? 0n,
      timestamp: log.blockNumber !== null ? (timestamps.get(log.blockNumber) ?? null) : null,
      inputSnapshotHash: logged.inputSnapshotHash,
      rawProposalHash: logged.rawProposalHash,
      rationaleHash: logged.rationaleHash,
      clampedAllocBps: logged.clampedAllocBps,
      snapshotJson: data?.snapshotJson ?? '',
      rawProposalJson: data?.rawProposalJson ?? '',
      rationale: data?.rationale ?? ''
    })
  }

  return decisions.sort((a, b) => b.epoch - a.epoch)
}

const CHUNK_SIZE = 9_000n

async function getLogsResilient(
  vault: `0x${string}`,
  eventName: 'DecisionLogged' | 'DecisionData',
  latest: bigint
): Promise<Log[]> {
  const event = findEvent(eventName)
  try {
    return (await publicClient.getLogs({
      address: vault,
      event: event as never,
      fromBlock: 0n,
      toBlock: latest
    })) as Log[]
  } catch {
    return chunkedGetLogs(vault, event, latest)
  }
}

async function chunkedGetLogs(vault: `0x${string}`, event: unknown, latest: bigint): Promise<Log[]> {
  const out: Log[] = []
  let from = 0n
  while (from <= latest) {
    const to = from + CHUNK_SIZE > latest ? latest : from + CHUNK_SIZE
    try {
      const logs = (await publicClient.getLogs({
        address: vault,
        event: event as never,
        fromBlock: from,
        toBlock: to
      })) as Log[]
      out.push(...logs)
    } catch {
      // skip an unreadable window rather than aborting the whole timeline
    }
    from = to + 1n
  }
  return out
}

interface DecodedLogged {
  epoch: number
  inputSnapshotHash: `0x${string}`
  rawProposalHash: `0x${string}`
  rationaleHash: `0x${string}`
  clampedAllocBps: number[]
}

interface DecodedData {
  epoch: number
  snapshotJson: string
  rawProposalJson: string
  rationale: string
}

function decodeLoggedLog(log: Log): DecodedLogged | null {
  try {
    const { args } = decodeEventLog({
      abi: vaultAbi,
      data: log.data,
      topics: log.topics,
      eventName: 'DecisionLogged'
    }) as unknown as { args: Record<string, unknown> }
    return {
      epoch: Number(args.epoch),
      inputSnapshotHash: args.inputSnapshotHash as `0x${string}`,
      rawProposalHash: args.rawProposalHash as `0x${string}`,
      rationaleHash: args.rationaleHash as `0x${string}`,
      clampedAllocBps: (args.clampedAllocBps as readonly number[]).map(Number)
    }
  } catch {
    return null
  }
}

function decodeDataLog(log: Log): DecodedData | null {
  try {
    const { args } = decodeEventLog({
      abi: vaultAbi,
      data: log.data,
      topics: log.topics,
      eventName: 'DecisionData'
    }) as unknown as { args: Record<string, unknown> }
    return {
      epoch: Number(args.epoch),
      snapshotJson: String(args.snapshotJson),
      rawProposalJson: String(args.rawProposalJson),
      rationale: String(args.rationale)
    }
  } catch {
    return null
  }
}

function findEvent(name: string): unknown {
  const abi = mandateVaultAbi as readonly { type: string; name?: string }[]
  return abi.find((item) => item.type === 'event' && item.name === name)
}

async function fetchBlockTimestamps(blockNumbers: bigint[]): Promise<Map<bigint, number>> {
  const out = new Map<bigint, number>()
  await Promise.all(
    blockNumbers.map(async (bn) => {
      try {
        const block = await publicClient.getBlock({ blockNumber: bn })
        out.set(bn, Number(block.timestamp))
      } catch {
        /* leave unset */
      }
    })
  )
  return out
}
