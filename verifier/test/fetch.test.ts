import { describe, expect, it } from 'vitest'
import type { PublicClient } from 'viem'
import { canonicalJson, hashString } from '@mandate-vault/clamp-core'
import { fetchDecisionEvents } from '../src/fetch.js'

const VAULT = '0x4444444444444444444444444444444444444444' as const
const TX = '0x5555555555555555555555555555555555555555555555555555555555555555'

const snapshotJson = canonicalJson({ ts: 1, chainId: 5003 })
const rawProposalJson = canonicalJson({ regime: 'NEUTRAL', targetAllocBps: [10_000], rationale: 'hold' })
const rationale = 'hold'

interface GetLogsParams {
  readonly fromBlock: bigint | 'earliest'
  readonly toBlock: bigint | 'latest'
  readonly event: { readonly name: string }
}

interface FakeClientOptions {
  readonly latest: bigint
  /** Block holding the decision events; null = events never found. */
  readonly eventBlock: bigint | null
  /** RPC rejects any range spanning >= maxRange blocks (Mantle Sepolia: 10k). */
  readonly maxRange: bigint
}

/** Stub PublicClient reproducing the live RPC's range-cap behaviour. */
function makeFakeClient(opts: FakeClientOptions): {
  client: PublicClient
  ranges: () => readonly { from: bigint; to: bigint }[]
} {
  let accepted: readonly { from: bigint; to: bigint }[] = []
  const stub = {
    getBlockNumber: async (): Promise<bigint> => opts.latest,
    getLogs: async (params: GetLogsParams): Promise<unknown[]> => {
      const from = params.fromBlock === 'earliest' ? 0n : params.fromBlock
      const to = params.toBlock === 'latest' ? opts.latest : params.toBlock
      if (to - from >= opts.maxRange) {
        throw new Error('block range greater than 10000 max')
      }
      accepted = [...accepted, { from, to }]
      if (opts.eventBlock === null || opts.eventBlock < from || opts.eventBlock > to) return []
      const base = { blockNumber: opts.eventBlock, transactionHash: TX }
      if (params.event.name === 'DecisionLogged') {
        return [
          {
            ...base,
            args: {
              epoch: 1n,
              inputSnapshotHash: hashString(snapshotJson),
              rawProposalHash: hashString(rawProposalJson),
              clampedAllocBps: [10_000],
              rationaleHash: hashString(rationale)
            }
          }
        ]
      }
      return [{ ...base, args: { epoch: 1n, snapshotJson, rawProposalJson, rationale } }]
    }
  }
  return { client: stub as unknown as PublicClient, ranges: () => accepted }
}

describe('fetchDecisionEvents — chunked fallback', () => {
  it('falls back to windowed scanning when the RPC rejects wide ranges', async () => {
    const { client, ranges } = makeFakeClient({ latest: 25_000n, eventBlock: 24_500n, maxRange: 10_000n })
    const d = await fetchDecisionEvents(client, VAULT, 1n, 'earliest')
    expect(d.decisionData.snapshotJson).toBe(snapshotJson)
    expect(d.decisionData.rawProposalJson).toBe(rawProposalJson)
    expect(d.decisionLogged.clampedAllocBps).toEqual([10_000])
    expect(d.decisionLogged.epoch).toBe(1n)
    expect(d.blockNumber).toBe(24_500n)
    expect(d.transactionHash).toBe(TX)
    // every accepted window respected the RPC's range cap
    expect(ranges().every((r) => r.to - r.from < 10_000n)).toBe(true)
  })

  it('scans newest-first and stops once the events are found', async () => {
    const { client, ranges } = makeFakeClient({ latest: 100_000n, eventBlock: 99_000n, maxRange: 10_000n })
    await fetchDecisionEvents(client, VAULT, 1n, 'earliest')
    // events sit in the newest window — older blocks must never be scanned
    const minFrom = ranges().reduce((m, r) => (r.from < m ? r.from : m), 100_000n)
    expect(minFrom > 50_000n).toBe(true)
  })

  it('respects --from-block as the scan floor', async () => {
    const { client, ranges } = makeFakeClient({ latest: 30_000n, eventBlock: null, maxRange: 10_000n })
    await expect(fetchDecisionEvents(client, VAULT, 1n, 25_000n)).rejects.toThrow(
      /no decision events found/
    )
    expect(ranges().every((r) => r.from >= 25_000n)).toBe(true)
  })

  it('throws a helpful error when no events exist for the epoch', async () => {
    const { client } = makeFakeClient({ latest: 25_000n, eventBlock: null, maxRange: 10_000n })
    await expect(fetchDecisionEvents(client, VAULT, 7n, 'earliest')).rejects.toThrow(
      /no decision events found for epoch 7/
    )
  })

  it('uses the single wide request when the RPC allows it', async () => {
    const { client, ranges } = makeFakeClient({
      latest: 25_000n,
      eventBlock: 100n,
      maxRange: 1_000_000n
    })
    const d = await fetchDecisionEvents(client, VAULT, 1n, 'earliest')
    expect(d.blockNumber).toBe(100n)
    expect(ranges().length).toBe(2) // one DecisionLogged + one DecisionData call
  })
})
