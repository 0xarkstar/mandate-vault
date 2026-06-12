/**
 * viem log/state fetching for the verifier CLI.
 *
 * Wide-range getLogs is attempted first; if the RPC rejects it, we fall back to
 * scanning 50k-block windows (newest-first, so recent epochs resolve quickly).
 */
import {
  createPublicClient,
  defineChain,
  http,
  parseAbiItem,
  type Abi,
  type Address,
  type Chain,
  type PublicClient
} from 'viem'
import { mandateVaultAbi } from '@mandate-vault/abi'
import { MandateBoundsSchema, type MandateBounds } from '@mandate-vault/clamp-core'
import type { DecisionDataEvent, DecisionLoggedEvent } from './verify.js'

export const DEFAULT_RPC_URL = 'https://rpc.sepolia.mantle.xyz'
const INITIAL_CHUNK_SIZE = 50_000n
const MIN_CHUNK_SIZE = 1_000n

/** Mantle Sepolia (chainId 5003) — defined manually, not relied upon in viem/chains. */
export function mantleSepolia(rpcUrl: string): Chain {
  return defineChain({
    id: 5003,
    name: 'Mantle Sepolia',
    nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    testnet: true
  })
}

export function createVerifierClient(rpcUrl: string): PublicClient {
  // Batch + patient retries: the public Mantle Sepolia RPC rate-limits bursts.
  return createPublicClient({
    chain: mantleSepolia(rpcUrl),
    transport: http(rpcUrl, { batch: { wait: 50 }, retryCount: 5, retryDelay: 1000 })
  })
}

// -------------------------------------------------------------------- events

const decisionLoggedEvent = parseAbiItem(
  'event DecisionLogged(uint64 indexed epoch, bytes32 inputSnapshotHash, bytes32 rawProposalHash, uint16[] clampedAllocBps, bytes32 rationaleHash)'
)
const decisionDataEvent = parseAbiItem(
  'event DecisionData(uint64 indexed epoch, string snapshotJson, string rawProposalJson, string rationale)'
)

export interface FetchedDecision {
  readonly decisionLogged: DecisionLoggedEvent
  readonly decisionData: DecisionDataEvent
  readonly blockNumber: bigint | null
  readonly transactionHash: string | null
}

async function getLogsInRange(
  client: PublicClient,
  vault: Address,
  epoch: bigint,
  fromBlock: bigint | 'earliest',
  toBlock: bigint | 'latest'
) {
  const [logged, data] = await Promise.all([
    client.getLogs({
      address: vault,
      event: decisionLoggedEvent,
      args: { epoch },
      fromBlock,
      toBlock,
      strict: true
    }),
    client.getLogs({
      address: vault,
      event: decisionDataEvent,
      args: { epoch },
      fromBlock,
      toBlock,
      strict: true
    })
  ])
  return { logged, data }
}

type LogPair = Awaited<ReturnType<typeof getLogsInRange>>

async function getLogsWithChunkFallback(
  client: PublicClient,
  vault: Address,
  epoch: bigint,
  fromBlock: bigint | 'earliest'
): Promise<LogPair> {
  try {
    return await getLogsInRange(client, vault, epoch, fromBlock, 'latest')
  } catch {
    return scanInChunks(client, vault, epoch, fromBlock)
  }
}

/**
 * Newest-first windowed scan for RPCs that reject wide getLogs ranges.
 * Stops as soon as both events are found (each epoch is emitted exactly once).
 * Windows start at 50k blocks and shrink (÷5) when the RPC rejects them too —
 * the public Mantle Sepolia RPC caps ranges at 10k blocks (verified live:
 * `eth_getLogs` returns "block range greater than 10000 max" above that).
 */
async function scanInChunks(
  client: PublicClient,
  vault: Address,
  epoch: bigint,
  fromBlock: bigint | 'earliest'
): Promise<LogPair> {
  const latest = await client.getBlockNumber()
  const start = fromBlock === 'earliest' ? 0n : fromBlock
  let chunkSize = INITIAL_CHUNK_SIZE
  let logged: LogPair['logged'] = []
  let data: LogPair['data'] = []
  let to = latest
  while (to >= start) {
    const from = to - chunkSize + 1n > start ? to - chunkSize + 1n : start
    try {
      const chunk = await getLogsInRange(client, vault, epoch, from, to)
      logged = [...chunk.logged, ...logged]
      data = [...chunk.data, ...data]
      if (logged.length > 0 && data.length > 0) break
      to = from - 1n
    } catch (err) {
      if (chunkSize <= MIN_CHUNK_SIZE) {
        throw new Error(
          `log scan failed even at ${MIN_CHUNK_SIZE}-block windows: ` +
            (err instanceof Error ? err.message : String(err))
        )
      }
      const shrunk = chunkSize / 5n
      chunkSize = shrunk > MIN_CHUNK_SIZE ? shrunk : MIN_CHUNK_SIZE
    }
  }
  return { logged, data }
}

/** Fetch the DecisionLogged + DecisionData pair for one epoch. */
export async function fetchDecisionEvents(
  client: PublicClient,
  vault: Address,
  epoch: bigint,
  fromBlock: bigint | 'earliest'
): Promise<FetchedDecision> {
  const { logged, data } = await getLogsWithChunkFallback(client, vault, epoch, fromBlock)
  // epoch is a strictly increasing counter, so each event fires at most once;
  // index 0 is taken defensively should an RPC ever return duplicates.
  const loggedLog = logged[0]
  const dataLog = data[0]
  if (!loggedLog || !dataLog) {
    throw new Error(
      `no decision events found for epoch ${epoch} on ${vault} ` +
        `(DecisionLogged: ${logged.length}, DecisionData: ${data.length}) — ` +
        `check --vault, --epoch and --from-block`
    )
  }
  return {
    decisionLogged: {
      epoch: loggedLog.args.epoch,
      inputSnapshotHash: loggedLog.args.inputSnapshotHash,
      rawProposalHash: loggedLog.args.rawProposalHash,
      clampedAllocBps: loggedLog.args.clampedAllocBps,
      rationaleHash: loggedLog.args.rationaleHash
    },
    decisionData: {
      epoch: dataLog.args.epoch,
      snapshotJson: dataLog.args.snapshotJson,
      rawProposalJson: dataLog.args.rawProposalJson,
      rationale: dataLog.args.rationale
    },
    blockNumber: dataLog.blockNumber,
    transactionHash: dataLog.transactionHash
  }
}

// -------------------------------------------------------------------- mandate

/**
 * Read the CURRENT mandate bounds from the vault. The owner may have updated
 * bounds since the verified epoch (setMandateBounds) — the CLI surfaces this
 * caveat; for the demo the current bounds are authoritative.
 */
export async function fetchMandateBounds(
  client: PublicClient,
  vault: Address
): Promise<MandateBounds> {
  const raw = await client.readContract({
    address: vault,
    abi: mandateVaultAbi as Abi,
    functionName: 'mandate'
  })
  // zod-validate the RPC response; strips non-bounds Mandate fields.
  return MandateBoundsSchema.parse(raw)
}
