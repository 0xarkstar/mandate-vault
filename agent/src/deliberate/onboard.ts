/**
 * Onboarding translation, THIN slice (Ouroboros-lite): a plain-language
 * investment intent → a draft mandate plus an explicit AMBIGUITY SCORE.
 * Deterministic single pass — every unresolved dimension becomes a question
 * and raises the score; it never guesses silently. The full multi-round
 * interview loop (ask → refine → re-score until below threshold) is ROADMAP
 * (docs/HARNESS.md), not this slice.
 */

export interface MandateDraft {
  /** Index-aligned to [safe, carry, treasury] template assets. */
  minBps: number[]
  maxBps: number[]
  maxDrawdownBps: number
  rebalanceCooldown: number
  tripMode: 'freeze' | 'derisk'
}

export interface OnboardResult {
  draft: MandateDraft
  /** 0 = fully specified, 1 = nothing could be inferred. */
  ambiguityScore: number
  /** What was inferred and from which phrase (audit trail). */
  assumptions: string[]
  /** What a full onboarding interview would ask next. */
  questions: string[]
}

interface RiskProfile {
  name: string
  minBps: number[]
  maxBps: number[]
  maxDrawdownBps: number
}

const PROFILES: Record<'conservative' | 'balanced' | 'aggressive', RiskProfile> = {
  conservative: { name: 'conservative', minBps: [7000, 0, 0], maxBps: [10_000, 3000, 0], maxDrawdownBps: 500 },
  balanced: { name: 'balanced', minBps: [3000, 0, 0], maxBps: [10_000, 7000, 0], maxDrawdownBps: 1000 },
  aggressive: { name: 'aggressive', minBps: [2000, 0, 0], maxBps: [10_000, 8000, 2000], maxDrawdownBps: 1500 }
}

const RISK_SIGNALS: Array<{ pattern: RegExp; profile: keyof typeof PROFILES }> = [
  { pattern: /conservativ|capital preservation|low.?risk|safe|treasury reserve|runway|payroll/i, profile: 'conservative' },
  { pattern: /balanced|moderate|medium.?risk/i, profile: 'balanced' },
  { pattern: /aggressiv|growth|high.?risk|max(imum)? (yield|return)/i, profile: 'aggressive' }
]

/** "max drawdown 8%", "8% drawdown", "drawdown of 8 percent" → 800 bps. */
const DRAWDOWN_RE = /(?:drawdown[^0-9%]{0,20}|down(?:side)?[^0-9%]{0,10})?(\d{1,2}(?:\.\d)?)\s*(?:%|percent)\s*(?:max(?:imum)?\s*)?(?:drawdown|loss|down)?/i

export function draftMandate(intentText: string): OnboardResult {
  const text = intentText.trim()
  const assumptions: string[] = []
  const questions: string[] = []
  let unresolved = 0
  const DIMENSIONS = 4 // risk profile, drawdown, trip behavior, cadence

  // 1. risk profile
  const risk = RISK_SIGNALS.find((s) => s.pattern.test(text))
  const profile = risk ? PROFILES[risk.profile] : PROFILES.conservative
  if (risk) {
    assumptions.push(`risk profile "${profile.name}" inferred from intent wording`)
  } else {
    unresolved++
    questions.push('What risk profile fits — capital preservation, balanced, or growth?')
    assumptions.push('defaulted to "conservative" (safest) because no risk wording was found')
  }

  // 2. drawdown tolerance (explicit number wins over the profile default)
  let maxDrawdownBps = profile.maxDrawdownBps
  const ddMatch = /drawdown|loss|lose|down/i.test(text) ? text.match(DRAWDOWN_RE) : null
  if (ddMatch?.[1]) {
    const pct = Number.parseFloat(ddMatch[1])
    if (pct > 0 && pct <= 50) {
      maxDrawdownBps = Math.round(pct * 100)
      assumptions.push(`max drawdown ${pct}% taken from intent text`)
    }
  } else {
    unresolved++
    questions.push('What is the maximum drawdown you can tolerate before the vault locks down?')
  }

  // 3. trip behavior
  let tripMode: MandateDraft['tripMode'] = 'freeze'
  if (/sell (everything|all)|exit to (cash|stable)|liquidate/i.test(text)) {
    tripMode = 'derisk'
    assumptions.push('trip mode "derisk" inferred (intent asks to exit on breach)')
  } else if (/hold|freeze|don'?t sell|no forced/i.test(text)) {
    assumptions.push('trip mode "freeze" inferred (intent asks to hold on breach)')
  } else {
    unresolved++
    questions.push('On a drawdown breach, should the vault FREEZE (hold positions) or DERISK (exit to the safe asset)?')
    assumptions.push('defaulted trip mode to "freeze" (never force-sell into a crash)')
  }

  // 4. rebalance cadence
  let rebalanceCooldown = 3600
  const cadence = text.match(/every\s+(\d{1,3})\s*(minute|min|hour|hr|day)s?/i)
  if (cadence?.[1] && cadence[2]) {
    const n = Number.parseInt(cadence[1], 10)
    const unit = /day/i.test(cadence[2]) ? 86_400 : /hour|hr/i.test(cadence[2]) ? 3600 : 60
    rebalanceCooldown = Math.max(60, n * unit)
    assumptions.push(`rebalance cooldown ${rebalanceCooldown}s taken from intent text`)
  } else {
    unresolved++
    questions.push('How often may the agent rebalance at most?')
  }

  return {
    draft: {
      minBps: [...profile.minBps],
      maxBps: [...profile.maxBps],
      maxDrawdownBps,
      rebalanceCooldown,
      tripMode
    },
    ambiguityScore: unresolved / DIMENSIONS,
    assumptions,
    questions
  }
}
