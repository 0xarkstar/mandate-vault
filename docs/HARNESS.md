# MandateVault — Agent & Harness Design

> The agent's architecture. Authoritative for `agent/src/` structure.
> Companion to docs/SUBMISSION.md (product) and docs/DESIGN.md (contracts).
> Core invariant: **the execution path never touches an LLM.**

## The one principle

LLM output is a *proposal*, never a command. Three engines run on three clocks;
the fast clock (execution) is pure deterministic code. The system gets smarter
over time (learning engine) but trades never pass through the learning or the
LLM at fill time.

```
LEARNING engine   (background, minutes–hours)  → compiles a fast policy index
DELIBERATION engine (slow, ~1/hour)            → decides WHAT (LLM here)
EXECUTION engine  (fast, milliseconds)         → decides HOW  (no LLM, ever)
```

## Three engines

| Engine | Clock | Decides | LLM | Latency budget |
|---|---|---|---|---|
| Learning | minutes–hours, background | how to improve | yes | irrelevant (off hot path) |
| Deliberation | ~1/hour (cooldown-bound) | WHAT to do (intent) | yes | seconds OK |
| Execution | milliseconds | HOW to fill | **no** | none |

### Why this shape
- A trade that delays is a trade no one uses → execution is deterministic and
  reads only a pre-compiled index, never reasons.
- "Should we act?" may be slow and is allowed to resolve to *no action* (funds
  stay in the safe sleeve). What's delayed is the decision, not a fill in
  flight — every fill that happens is fast.
- Learning compounds in the background; its only contact with the hot path is a
  small versioned index the execution engine reads.

## Data contracts (the actual interfaces)

These typed boundaries are the design. Engines communicate only through them.

```ts
// ── Deliberation → Execution. The ONLY thing the LLM half hands over. ──
interface ExecutionIntent {
  vault: Address
  targetAllocBps: number[]      // already clamped to mandate by deliberation
  maxSlippageBps: number        // hard gate for the execution engine
  playbookVersion: number       // which compiled policy informed this intent
  snapshotHash: Hex             // links to the on-chain audit record
  reviewVerdict: 'approved' | 'hold'
}

// ── Learning → Deliberation. Compiled, fast to read (MEMORY.md pattern). ──
interface PolicyIndex {
  version: number
  // small, flat lookups — NOT raw history. e.g. per-regime execution hints.
  regimeHints: Record<RegimeLabel, { preferredRoute: string; observedSlippageBps: number }>
  updatedAtBlock: bigint
}

// ── On-chain record (already implemented, + playbookVersion field) ──
//   DecisionLogged(epoch, inputSnapshotHash, rawProposalHash,
//                  clampedAllocBps, rationaleHash)
//   DecisionData(epoch, snapshotJson, rawProposalJson, rationale)
//   snapshotJson now carries: { ..., playbookVersion }   // verification invariant
```

The contract layer is unchanged from DESIGN.md. `playbookVersion` rides inside
the existing `snapshotJson` string — no new event, the verifier already replays
whatever the schema declares.

## Deliberation engine (slow path — LLM lives here)

Pipeline, each stage a module under `agent/src/deliberate/`:

```
context → onboard-gate → propose → review → ambiguity-gate → ExecutionIntent
```

1. **context** (`context.ts`, deterministic) — assemble snapshot: Bybit funding,
   oracle prices, vault state, + read `PolicyIndex` (fast lookup, not reasoning).
2. **onboard gate** (`onboard.ts`, LLM, **setup-time only**) — Ouroboros-style:
   turn plain intent into a mandate, *refuse* until ambiguity ≤ threshold;
   bounded to N rounds then abort to "needs human". Runs when a vault is created,
   not every cycle.
3. **propose** (`propose.ts`, LLM) — given snapshot + mandate + policy hints,
   emit `Proposal {regime, targetAllocBps, rationale}` (ProposalSchema, zod).
4. **review** (`review.ts`, LLM, **different model**) — adversarial check of the
   proposal against mandate + market context. No self-approval (OMC rule).
   Returns `{verdict: approved|hold, reason}`.
5. **ambiguity gate** (`gate.ts`, deterministic) — if review=hold, or proposer
   and reviewer disagree beyond tolerance, or signals conflict → **HOLD** (no
   intent emitted, funds untouched). Bounded: never loops, one pass → act or hold.
6. **clamp + emit** — `clamp-core` cages the agreed allocation to mandate, build
   `ExecutionIntent`, hand to execution engine. LLM involvement ends here.

Bounded-loop rule: every gate resolves in one pass to `act` or `hold`. "Not
confident" → hold (default-safe), never an open loop.

## Execution engine (fast path — NO LLM, pure deterministic)

Modules under `agent/src/execute/`. Takes an `ExecutionIntent`, returns a fill:

```
rfq.requestQuotes(intent)         // solicit signed firm quotes from MM bots
  → route.selectBest(quotes, mid) // compare vs oracle mid, pick best improvement
  → route.slippageGate(best, intent.maxSlippageBps)  // within bound? else FREEZE
  → submit.fill(intent, best)     // rebalance() — contract re-checks mandate, atomic
```

- Quotes are **EIP-712 signed `{assetIn, assetOut, amountIn, amountOut, expiry, mm}`**.
  Selection is arithmetic (best amountOut vs oracle mid) — no model, microseconds.
- Slippage gate is a numeric comparison. Fail → do not fill (freeze), never dump.
- The contract's on-chain mandate re-check is the final deterministic backstop.

## Learning engine (background — off the hot path)

Modules under `agent/src/learn/`. Never called during a trade.

```
distill.ts:  read on-chain DecisionLogged/Data (append-only)  // Karpathy substrate
             → rewrite refined heuristics (Kepano: update, don't accumulate)
index.ts:    compile heuristics → PolicyIndex vN              // MEMORY.md index pattern
             → persisted; deliberation reads it, execution never reasons over it
```

Memory-philosophy mapping (the design borrows three discipline layers):
- **Karpathy append-only** = the on-chain decision log (immutable substrate).
- **Kepano rewrite** = distillation refines/replaces heuristics, no audit-log bloat.
- **MEMORY.md index** = the compiled `PolicyIndex` is a small pointer table, not
  the full history — this is *why* the hot path stays fast.

## Harness invariants (what makes it safe + fast)

1. **No LLM on the execution path.** Constitutional. RFQ compare + fill are
   deterministic. Breaking this breaks both latency and verifiability.
2. **Every decision snapshots its `playbookVersion`.** Learning may evolve; a
   past decision must still replay against the policy it actually used.
3. **All gates/loops are bounded.** Deliberation resolves in one pass to act or
   hold; onboarding is capped at N rounds then aborts. No unbounded loops in a
   money system. "Not confident" defaults to no action, not to retry-forever.
4. **Proposer ≠ reviewer.** Self-approval forbidden (OMC). Different models →
   the adversarial check also powers Agent Arena.
5. **Three-plus enforcement layers on any state change.** off-chain clamp →
   reviewer veto → on-chain mandate re-check → autonomous breach freeze.
   The LLM touches one stage; the rest are verified code.

## Why each prior claim holds under this design

| Claim | Mechanism in this harness |
|---|---|
| trades don't slow down | execution engine: ms, deterministic, index-only |
| system improves over time | learning engine compounds in background → ERC-8004 accrues refined intelligence, not just uptime |
| not "LLM-pasting" | proposer/reviewer split + gating + learning = OMC/Ouroboros philosophy as harness, not a single call |
| verifiable | every engine output recorded with playbookVersion, replayable |
| safe under jailbreak | LLM never on execution path; the path it is on has 4 verified layers around it |

## Build scope (4-day honesty)

- **EXECUTION engine (RFQ): build first, full.** Core pillar, biggest latency
  risk, demoable. EIP-712 venue + 2 MM bots + slippage gate + atomic fill.
- **DELIBERATION proposer/reviewer split + gate: build, medium.** Onboarding
  gate: thin (intent→mandate with an ambiguity score), full Ouroboros loop = roadmap.
- **LEARNING engine: thin demo + roadmap.** Read logs → simple per-regime
  slippage stats → "Playbook vN" card in UI + playbookVersion in snapshot. The
  full distillation/compounding loop is explicitly roadmap, labeled as such.

Building the full learning loop at the cost of finishing RFQ would be
backwards. Learning ships as architecture + a thin slice; execution ships whole.
