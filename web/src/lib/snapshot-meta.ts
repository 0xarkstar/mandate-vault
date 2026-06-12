/**
 * Parsers for the optional learning-engine metadata that the agent may attach
 * to a decision's input snapshot JSON: the playbook version it executed against
 * and whether the LLM fell back to the deterministic hold path. Both are
 * tolerant of missing/old snapshots.
 */

export interface SnapshotMeta {
  /** Playbook (PolicyIndex) version, or null when the snapshot predates learning. */
  playbookVersion: number | null
  /** True when the agent used its deterministic fallback instead of a live LLM. */
  llmFallback: boolean
}

/** Parse {@link SnapshotMeta} out of a snapshot JSON string. */
export function extractSnapshotMeta(snapshotJson: string): SnapshotMeta {
  return {
    playbookVersion: extractPlaybookVersion(snapshotJson),
    llmFallback: extractLlmFallback(snapshotJson)
  }
}

/**
 * Parse `playbookVersion` (a number) from snapshot JSON. Returns null when the
 * field is absent or not a finite number — v0 means "pre-learning".
 */
export function extractPlaybookVersion(snapshotJson: string): number | null {
  const obj = safeObject(snapshotJson)
  if (obj === null) return null
  const v = obj.playbookVersion
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Parse `llmFallback` (a boolean) from snapshot JSON. Returns false when the
 * field is absent or not a boolean (assume a live LLM unless told otherwise).
 */
export function extractLlmFallback(snapshotJson: string): boolean {
  const obj = safeObject(snapshotJson)
  if (obj === null) return false
  return obj.llmFallback === true
}

function safeObject(json: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(json)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    /* ignore */
  }
  return null
}
