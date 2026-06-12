# MandateVault — Final Submission Definition

> Single source of truth for the DoraHacks BUIDL. README, pitch text, and the
> video script derive from this document. Deadline: 2026-06-16 00:59 KST.
> Track target: **AI x RWA** (organizer-triaged — submission text must signal it).

## One-liner

**MandateVault — the stability rails that make agentic asset management safe
enough for institutions, and cheap enough to fully audit only on Mantle.**

Money that must not break is guarded by the chain; the rest is managed by AI —
under an on-chain mandate it cannot escape.

## The product (final form)

**Positioning**: we do not manage assets, and we do not claim alpha. We are the
delegation-trust infrastructure — what custody (Fireblocks) did for *holding*,
MandateVault does for *delegating*.

**The five rails** (all chain-enforced):
1. **Separation of powers** — the agent key can ONLY call `rebalance()`; it can
   never withdraw, transfer, or change the mandate. Worst case of total agent
   compromise = suboptimal allocation within bounds.
2. **Mandate enforcement** — per-asset min/max bounds, whitelist, cooldown
   re-checked on-chain at execution; violations revert.
3. **Autonomous circuit breaker** — drawdown floor vs HWM; permissionless
   `tripCheck()` de-risks to the safe asset and suspends the agent with no
   human latency.
4. **Evidence generation** — every decision logged with full input snapshot,
   raw LLM proposal, committee memos and rationale; third-party replay
   verification via the shared clamp module. Compliance becomes proof, not claim.
5. **Manager portability** — `setAgent()` swaps the manager without
   liquidation; track record accrues to the vault + ERC-8004 identity.

**Specialization**: survival-first management — the hard wall between
"money that must not break" and "money that may work":
- Retail door: template vaults = emergency-fund floor (robo-advisor UX)
- Org door: custom mandates = runway floor (projects/DAOs) / IPS (institutions)
- Same contract fields, different labels: `minBps[safe]` = the floor.

**AX layer (not LLM-pasting)**: the agent runs an **AI investment committee** —
Market Analyst, RWA Credit Analyst, Compliance Officer, CIO synthesis — four
LLM roles producing audit-grade committee minutes per decision, anchored
on-chain. Numbers stay deterministic (clamp + on-chain checks); language work
(analysis, compliance notes, minutes) is the LLM's irreplaceable job. This is
the middle-office paper trail institutions actually pay for, automated.

**The kick — Agent Arena**: identical mandates, identical market data,
different LLMs (gpt-oss vs qwen vs llama), chain-scored **behavior**:
mandate-compliance rate, cage-hit count, drawdown response, memo consistency.
We do not claim the winner has alpha; we claim the loser's behavior is now
provable. This is the hackathon's own thesis (on-chain AI benchmarking — the
"Turing Test") implemented as a product.

**Security thesis**: assume the LLM is already jailbroken. Defense is not
prevention but futility — max reward of a successful jailbreak = burning the
pre-committed risk budget (then the trip fires). Zero exfiltration, zero
concealment (clamped deltas and reverts are on-chain attack telemetry).
Demo scene 1 IS a live jailbreak simulation.

**Why Mantle (necessity, not choice)**:
1. Radical auditability economics — several KB of evidence per decision is
   cents on Mantle vs dollars on L1 (to be MEASURED from Sepolia gas receipts
   and published in the README).
2. The RWA collateral set (USDY/mUSD, mETH, fBTC) is native here.
3. ERC-8004 agent identity is being standardized here (this hackathon).
4. Completes Mantle's own TradFi-distribution thesis: assets existed,
   delegation rails did not.

**Business model**: no token by design. Management fee + performance fee above
the T-bill hurdle, collected by the contract. MNT value flows: recurring agent
gas, sticky delegated TVL, native-asset demand.

## What judges receive (the 5 deliverables)

1. **Public GitHub repo** — contracts (Foundry), agent, verifier, clamp-core,
   web; README with architecture, measured gas economics, security model
   (hackathon-honest: reviewed + tested, not audited; mainnet prerequisites
   listed).
2. **Mantle Sepolia deployment** — factory + template vaults, source-verified
   on mantlescan; addresses in README + submission.
3. **Live frontend (CF Pages)** — vault list/detail, mandate visualization,
   committee minutes tabs, behavior stream (cage diagram, allocation chart,
   behavior badges), Arena leaderboard, in-browser Verify.
4. **Demo video (≥2 min)** — scene 1 jailbreak→revert, scene 2 crash→auto-trip,
   scene 3 verify ✓ / tamper ✗, scene 4 arena leaderboard walk.
5. **Submission text** — RWA-track triage vocabulary up front (USDY/mETH,
   portfolio/mandate/risk), five rails, committee, arena, fee model, Mantle
   necessity argument.

## Scorecard mapping

| Criterion | Answer |
|---|---|
| AI×RWA integration depth 15 | Committee pipeline drives portfolio decisions on USDY-family/mETH; outputs verifiable (rail 4) |
| Mantle integration 10 | Necessity argument + measured gas economics + native assets |
| Compliance awareness 10 | Mandate=IPS, compliance officer role, deposit gating pattern, audit-grade minutes |
| Path B application 10 | Defined assets, defined users (retail floor / org runway), end-to-end UX |
| Execution & demo 5 | Deployed, verified, live site, repeatable scenes |
| GC: ecosystem contribution | Flows: agent gas, sticky TVL, native-asset demand; grantee-treasury GTM |

## Build status / remaining

DONE: contracts (26 tests) · clamp-core (13) · agent Bybit-first (44) ·
verifier (19) · web (38) · full local E2E rehearsal (all 3 scenes + sim + web).

REMAINING BUILD (≈1 day): committee pipeline (ProposalSchema.memos — no
contract change) · `--model` flag + arena runs · web upgrades (committee tabs,
cage diagram, allocation chart, behavior badges, leaderboard, runway display,
separation-of-powers card) · template renaming (Runway Guardian / Builder
Treasury) · agent treasury-context prompts.

BLOCKED ON USER: Sepolia faucet (deployer 0x23128FBb…0528, agent
0x9b1f06e6…73b8) · OpenRouter key (agent/.env) · Etherscan key
(contracts/.env). Real-LLM path untested until the key arrives.

THEN: deploy+verify → arena/timeline population on Sepolia → CF Pages →
gas measurement → README/pitch → video → DoraHacks submission (buffer 6/15).
