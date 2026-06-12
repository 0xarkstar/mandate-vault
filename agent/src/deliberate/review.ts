import type { Proposal, Snapshot } from '@mandate-vault/clamp-core'
import type { MandateView } from '../feeds/vault.js'
import { callModel, MODELS } from '../llm.js'
import { VerdictSchema, type Verdict } from './types.js'

/**
 * REVIEWER side of deliberation: a DIFFERENT model adversarially checks the
 * proposer's output against the mandate and snapshot (no self-approval — OMC
 * rule; also powers the Agent Arena). When no reviewer LLM is reachable the
 * verdict falls to a deterministic arithmetic check (bounds + sum) — the same
 * cage the clamp and the on-chain re-check enforce, so "reviewer down" can
 * loosen nothing.
 */

const ATTEMPTS = 2

const REVIEW_SYSTEM_PROMPT = [
  'You are an adversarial risk reviewer for an on-chain investment mandate.',
  'Another model proposed a target allocation. Your job is to find reasons to REJECT it.',
  'Hold when: any allocation is outside the mandate bounds, the sum is not exactly 10000,',
  'the rationale contradicts the snapshot (e.g. claims rising funding when funding is negative),',
  'or the proposal flips allocation drastically without justification.',
  'When in doubt, HOLD — a held cycle costs nothing, a bad fill costs principal.',
  'Respond with ONLY a JSON object, no prose, no markdown fences:',
  '{"verdict":"approved|hold","reason":"<=200 words"}'
].join('\n')

/** Extract + schema-parse a verdict from raw model output. Pure. */
export function parseVerdictContent(content: string): Verdict | null {
  if (typeof content !== 'string' || content.trim() === '') return null
  let body = content.trim()
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) body = fence[1].trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    const parsed = VerdictSchema.safeParse(JSON.parse(body.slice(start, end + 1)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Deterministic arithmetic review: in-bounds and sums to 10000 → approved.
 * Used directly when the proposer itself was the deterministic fallback, and
 * as the verdict of last resort when every reviewer model fails.
 */
export function deterministicReview(proposal: Proposal, mandate: MandateView): Verdict {
  const n = mandate.assets.length
  if (proposal.targetAllocBps.length !== n) {
    return { verdict: 'hold', reason: `deterministic review: length ${proposal.targetAllocBps.length} != assets ${n}` }
  }
  const sum = proposal.targetAllocBps.reduce((a, b) => a + b, 0)
  if (sum !== 10_000) {
    return { verdict: 'hold', reason: `deterministic review: sum ${sum} != 10000` }
  }
  for (let i = 0; i < n; i++) {
    const t = proposal.targetAllocBps[i]!
    if (t < mandate.minBps[i]! || t > mandate.maxBps[i]!) {
      return {
        verdict: 'hold',
        reason: `deterministic review: asset[${i}] ${t}bps outside [${mandate.minBps[i]}, ${mandate.maxBps[i]}]`
      }
    }
  }
  return { verdict: 'approved', reason: 'deterministic review: within bounds, sums to 10000' }
}

/** Pick a reviewer model that is NOT the proposer's model (invariant #4). */
export function pickReviewerModel(proposerModel: string | null): string {
  const other = MODELS.find((m) => m !== proposerModel)
  return other ?? MODELS[0]
}

export interface ReviewInputs {
  proposal: Proposal
  snapshot: Snapshot
  mandate: MandateView
  apiKey: string
  /** Model the proposer used (null = deterministic fallback proposer). */
  proposerModel: string | null
}

export interface ReviewResult {
  verdict: Verdict
  /** Reviewer model, or 'deterministic' when arithmetic review decided. */
  reviewer: string
}

export async function reviewProposal(inputs: ReviewInputs): Promise<ReviewResult> {
  const { proposal, snapshot, mandate, apiKey, proposerModel } = inputs

  // A deterministic proposer needs no LLM review — its output IS the
  // deterministic hold-position; arithmetic review suffices and keeps the
  // pipeline running with zero models available.
  if (proposerModel == null) {
    return { verdict: deterministicReview(proposal, mandate), reviewer: 'deterministic' }
  }

  const reviewerModel = pickReviewerModel(proposerModel)
  const userPrompt = [
    'Mandate bounds (per-asset, bps):',
    JSON.stringify(mandate.assets.map((a, i) => ({ index: i, asset: a, minBps: mandate.minBps[i], maxBps: mandate.maxBps[i] }))),
    'Input snapshot:',
    JSON.stringify(snapshot),
    'Proposal under review:',
    JSON.stringify(proposal)
  ].join('\n')

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const content = await callModel(reviewerModel, apiKey, REVIEW_SYSTEM_PROMPT, userPrompt)
    if (content == null) continue
    const verdict = parseVerdictContent(content)
    if (verdict) return { verdict, reviewer: reviewerModel }
  }

  // Every reviewer attempt failed → deterministic arithmetic verdict.
  return { verdict: deterministicReview(proposal, mandate), reviewer: 'deterministic' }
}
