/**
 * Construct an intentionally out-of-bounds allocation for demo scene 1
 * (`--violate`). Index 0 is the safe asset; forcing it to 0 and a risk sleeve to
 * 10000 violates the conservative/balanced mandate's minBps[0], so the on-chain
 * re-check reverts with MandateViolation. Pure + unit-testable.
 *
 * The result always has the same length as the mandate assets and sums to 10000
 * (a clean sum keeps the revert isolated to the per-asset bound, not the sum
 * check, making the demo message unambiguous).
 */
export function buildViolateTarget(assetCount: number): number[] {
  if (!Number.isInteger(assetCount) || assetCount < 1) {
    throw new Error(`assetCount must be a positive integer, got ${assetCount}`)
  }
  if (assetCount === 1) {
    // Single-asset mandate cannot be violated per-asset; sum must be 10000.
    return [10_000]
  }
  // [0, 10000, 0, 0, ...] — safe sleeve emptied (violates minBps[0]),
  // first risk sleeve maxed out, remainder zero. Sum = 10000.
  const target = new Array<number>(assetCount).fill(0)
  target[1] = 10_000
  return target
}
