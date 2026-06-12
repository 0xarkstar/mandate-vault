/** Drawdown trip behaviour: hold positions vs. sell to the safe asset. */
export type TripMode = 'FREEZE' | 'DERISK'

/** Mandate struct as returned by `vault.mandate()` (viem decodes the tuple to this shape). */
export interface Mandate {
  assets: readonly `0x${string}`[]
  minBps: readonly number[]
  maxBps: readonly number[]
  maxDrawdownBps: number
  rebalanceCooldown: number
  mgmtFeeBpsPerYear: number
  perfFeeBps: number
  hurdleBpsPerYear: number
  agent: `0x${string}`
  /** On breach: FREEZE (hold positions) or DERISK (sell to safe). */
  tripMode: TripMode
}

/** Live on-chain state of a vault, all amounts as 1e18 bigints unless noted. */
export interface VaultState {
  address: `0x${string}`
  mandate: Mandate
  currentAllocationBps: readonly number[]
  sharePrice: bigint
  hwmSharePrice: bigint
  totalValue: bigint
  totalShares: bigint
  tripped: boolean
  killed: boolean
  epoch: number
  lastRebalance: number
}

/** A decision reconstructed from DecisionLogged + DecisionData events. */
export interface Decision {
  epoch: number
  txHash: `0x${string}`
  blockNumber: bigint
  timestamp: number | null
  inputSnapshotHash: `0x${string}`
  rawProposalHash: `0x${string}`
  rationaleHash: `0x${string}`
  clampedAllocBps: readonly number[]
  snapshotJson: string
  rawProposalJson: string
  rationale: string
}

export type AssetSymbol = string

/** A single RFQ fill, decoded from a RFQVenue `QuoteFilled` event. */
export interface Fill {
  txHash: `0x${string}`
  blockNumber: bigint
  mm: `0x${string}`
  assetIn: `0x${string}`
  assetOut: `0x${string}`
  amountIn: bigint
  amountOut: bigint
  oracleMidOut: bigint
  /** Fill-vs-mid improvement; positive = better than oracle mid. */
  improvementBps: number
}
