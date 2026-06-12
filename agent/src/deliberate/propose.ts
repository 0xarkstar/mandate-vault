/**
 * PROPOSER side of the deliberation engine. The OpenRouter plumbing lives in
 * llm.ts (shared with the reviewer); this module is the proposer's home so the
 * engine split is explicit: propose.ts suggests, review.ts (a DIFFERENT model)
 * adversarially checks, gate.ts deterministically resolves to act-or-hold.
 */
export { proposeAllocation, FALLBACK_RATIONALE, MODELS, type LlmResult } from '../llm.js'
