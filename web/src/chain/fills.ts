import { decodeEventLog, type Log } from 'viem'
import { rfqVenueAbi } from '@mandate-vault/abi'
import { publicClient } from './clients'
import { fetchVaultVenue } from './reads'
import { config } from '../config'
import type { Fill } from '../lib/types'

const venueAbi = rfqVenueAbi as never

/**
 * Fetch every RFQ fill (QuoteFilled event) recorded by a vault's execution
 * venue. The venue address is read from `vault.venue()`; fills are returned
 * newest-first and joined to decisions by `transactionHash` downstream.
 *
 * Mirrors the resilient getLogs strategy in `decisions.ts`: one wide query
 * first, chunked fallback if the RPC caps block ranges.
 */
/** Per-venue in-flight/result cache: every vault on a factory shares one
 * venue, so the arena's 4 vaults must not re-scan the same logs 4 times. */
const fillsByVenue = new Map<string, Promise<Fill[]>>()

export async function fetchFills(vault: `0x${string}`): Promise<Fill[]> {
  const venue = await fetchVaultVenue(vault)
  const key = venue.toLowerCase()
  const cached = fillsByVenue.get(key)
  if (cached) return cached

  const promise = (async () => {
    const latest = await publicClient.getBlockNumber()
    const logs = await getLogsResilient(venue, latest)
    const fills: Fill[] = []
    for (const log of logs) {
      const decoded = decodeQuoteFilled(log)
      if (decoded) fills.push(decoded)
    }
    return fills.sort((a, b) => Number(b.blockNumber - a.blockNumber))
  })()
  fillsByVenue.set(key, promise)
  promise.catch(() => fillsByVenue.delete(key)) // don't cache failures
  return promise
}

const CHUNK_SIZE = 9_000n

async function getLogsResilient(venue: `0x${string}`, latest: bigint): Promise<Log[]> {
  const event = findEvent('QuoteFilled')
  try {
    return (await publicClient.getLogs({
      address: venue,
      event: event as never,
      fromBlock: config.startBlock,
      toBlock: latest
    })) as Log[]
  } catch {
    return chunkedGetLogs(venue, event, latest)
  }
}

async function chunkedGetLogs(venue: `0x${string}`, event: unknown, latest: bigint): Promise<Log[]> {
  const out: Log[] = []
  let from = config.startBlock
  while (from <= latest) {
    const to = from + CHUNK_SIZE > latest ? latest : from + CHUNK_SIZE
    try {
      const logs = (await publicClient.getLogs({
        address: venue,
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

function decodeQuoteFilled(log: Log): Fill | null {
  try {
    const { args } = decodeEventLog({
      abi: venueAbi,
      data: log.data,
      topics: log.topics,
      eventName: 'QuoteFilled'
    }) as unknown as { args: Record<string, unknown> }
    return {
      txHash: (log.transactionHash ?? '0x') as `0x${string}`,
      blockNumber: log.blockNumber ?? 0n,
      mm: args.mm as `0x${string}`,
      assetIn: args.assetIn as `0x${string}`,
      assetOut: args.assetOut as `0x${string}`,
      amountIn: args.amountIn as bigint,
      amountOut: args.amountOut as bigint,
      oracleMidOut: args.oracleMidOut as bigint,
      improvementBps: Number(args.improvementBps as bigint)
    }
  } catch {
    return null
  }
}

function findEvent(name: string): unknown {
  const abi = rfqVenueAbi as readonly { type: string; name?: string }[]
  return abi.find((item) => item.type === 'event' && item.name === name)
}
