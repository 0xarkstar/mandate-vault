import { ProposalSchema, type Proposal } from '@mandate-vault/clamp-core'
import type { MandateView } from './feeds/vault.js'
import type { Snapshot } from '@mandate-vault/clamp-core'

/**
 * OpenRouter LLM client. The model is FREE to propose anything inside
 * ProposalSchema — the clamp + on-chain re-check is the cage. On total failure
 * the caller falls back to a deterministic hold-position allocation.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
/** Truly-free ($0 prompt+completion) models, live-verified 2026-06-13.
 * qwen3-next/llama-3.3 free tiers were upstream-429ing and got replaced. */
const MODELS = [
  'openai/gpt-oss-120b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-31b-it:free'
] as const
const ATTEMPTS_PER_MODEL = 2
const TIMEOUT_MS = 30_000

const SYSTEM_PROMPT = [
  'You are a portfolio agent operating under an on-chain investment mandate.',
  'Asset roles by index:',
  '  index 0 = mUSD: T-bill-like SAFE sleeve earning ~4.5%/yr baseline.',
  '  index 1 = mMETH: staked-ETH CARRY sleeve. Attractiveness RISES with positive/rising',
  '    funding and FALLS with negative funding.',
  '  index 2 (if present) = mMNT: treasury sleeve.',
  'You must respect the mandate; out-of-bounds proposals are clamped and re-checked on-chain.',
  'Respond with ONLY a JSON object, no prose, no markdown fences:',
  '{"regime":"RISK_ON|NEUTRAL|RISK_OFF","targetAllocBps":[...],"rationale":"<=300 words"}',
  'targetAllocBps MUST sum to exactly 10000 and have the same length as the mandate assets.'
].join('\n')

export interface LlmResult {
  proposal: Proposal
  model: string
}

/**
 * Strip markdown code fences and extract the first balanced JSON object, then
 * parse with ProposalSchema. Pure — unit-testable without network.
 * Returns null on any failure (unparseable / schema mismatch).
 */
export function parseProposalContent(content: string): Proposal | null {
  if (typeof content !== 'string' || content.trim() === '') return null

  // Remove ```json ... ``` or ``` ... ``` fences.
  let body = content.trim()
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) body = fence[1].trim()

  // Fall back to the first {...} span if there is surrounding prose.
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  const jsonStr = body.slice(start, end + 1)

  try {
    const obj = JSON.parse(jsonStr)
    const parsed = ProposalSchema.safeParse(obj)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function buildUserPrompt(snapshot: Snapshot, mandate: MandateView): string {
  const bounds = mandate.assets.map((a, i) => ({
    index: i,
    asset: a,
    minBps: mandate.minBps[i],
    maxBps: mandate.maxBps[i]
  }))
  return [
    'Mandate bounds (per-asset, bps):',
    JSON.stringify(bounds),
    `maxDrawdownBps: ${mandate.maxDrawdownBps}`,
    'Current input snapshot:',
    JSON.stringify(snapshot),
    `Propose targetAllocBps of length ${mandate.assets.length} summing to 10000.`
  ].join('\n')
}

export async function callModel(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return data.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Query the model fallback chain. 2 attempts per model, then the next model.
 * Returns null when every model fails — the caller then uses fallbackAllocation
 * with llmFallback: true. `modelOverride` pins a single model (Agent Arena:
 * identical mandate/data, different brains, scored on execution quality).
 */
export async function proposeAllocation(
  snapshot: Snapshot,
  mandate: MandateView,
  apiKey: string,
  modelOverride?: string
): Promise<LlmResult | null> {
  const userPrompt = buildUserPrompt(snapshot, mandate)
  const models: readonly string[] = modelOverride ? [modelOverride] : MODELS
  for (const model of models) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_MODEL; attempt++) {
      const content = await callModel(model, apiKey, SYSTEM_PROMPT, userPrompt)
      if (content == null) continue
      const proposal = parseProposalContent(content)
      if (proposal && proposal.targetAllocBps.length === mandate.assets.length) {
        return { proposal, model }
      }
    }
  }
  return null
}

export const FALLBACK_RATIONALE = 'LLM unavailable — deterministic hold-position fallback'
export { MODELS }
