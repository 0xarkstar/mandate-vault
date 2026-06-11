/**
 * Canonical JSON: recursively sorted object keys, no whitespace.
 *
 * The agent serializes snapshots/proposals with this function before submitting
 * them on-chain; the verifier re-serializes with the same function and compares
 * keccak hashes. Byte-stability of this encoding is what makes hash comparison
 * meaningful, so DO NOT change this algorithm after decisions have been logged.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue)
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return Object.fromEntries(entries.map(([k, v]) => [k, sortValue(v)]))
  }
  return value
}
