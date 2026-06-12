import { Badge } from './ui/Badge'

/**
 * The behavioural signals derived from a decision (and its predecessor). Each
 * maps to one badge in the timeline row, mirroring the RegimeBadge pattern.
 */
export interface BehaviorSignals {
  /** Regime differs from the previous (older) decision. */
  regimeShift: boolean
  /** The clamp moved the proposal (raw != clamped). */
  cageHit: boolean
  /** The agent used its deterministic LLM fallback. */
  llmFallback: boolean
  /** Playbook version on the snapshot, or null when pre-learning. */
  playbookVersion: number | null
}

/** Render the behavioural badge strip for a decision row. */
export function BehaviorBadges({ signals }: { signals: BehaviorSignals }) {
  const badges = [
    signals.regimeShift ? <Badge key="rs" tone="blue">↬ Regime shift</Badge> : null,
    signals.cageHit ? <Badge key="ch" tone="amber">⚖️ Cage hit</Badge> : null,
    signals.llmFallback ? <Badge key="lf" tone="rose">⚙ LLM fallback</Badge> : null,
    signals.playbookVersion !== null ? (
      <Badge key="pb" tone="neutral">Playbook v{signals.playbookVersion}</Badge>
    ) : null
  ].filter(Boolean)

  if (badges.length === 0) return null
  return <div className="flex flex-wrap items-center gap-1.5">{badges}</div>
}
