# MandateVault — Final Submission Definition

> Single source of truth for the DoraHacks BUIDL. README, pitch text, and the
> video script derive from this document. Deadline: 2026-06-16 00:59 KST.
> Track target: **AI x RWA** (organizer-triaged — submission text must signal it).

## One-liner

**MandateVault — the smooth on-ramp for institutional capital onto Mantle: AI
executes, the mandate protects, the chain proves best execution.**

We do not decide what to invest in. We make institutional/RWA capital move onto
Mantle safely and without slippage — AX powers the execution and onboarding, the
mandate caps the risk, the chain records the proof.

## Positioning (the pivot)

NOT an AI fund manager. NOT alpha. We are an **AI-powered execution &
onboarding rail** for RWA capital. The AI's job is HOW capital moves
(execution, liquidity sourcing, onboarding translation) — never WHETHER to
invest. This dodges the alpha trap and makes the AI's output objectively
measurable (slippage bps, fill quality), which is a stronger answer to the
"is the AI output verifiable?" criterion than "was the allocation good?".

What custody (Fireblocks) did for *holding*, MandateVault does for *moving and
delegating* institutional capital on-chain.

## What it makes smooth (the three goals)

| Smooth what | What the AI directly does (AX) | Measured by |
|---|---|---|
| **Onboarding** — friction of institutional capital entering | Translate plain intent ("park 70% in T-bills, yield-hunt the rest, never below 6-month runway") into a safe on-chain mandate + initial positioning. Removes the Web3 operational barrier. | UX scorecard line |
| **Liquidity / execution** — slippage & MEV at trade time | **RFQ orchestration**: solicit signed firm quotes from MMs → pick best vs oracle mid → atomic fill. Zero slippage, sandwich-immune. | fill price vs mid, improvement bps |
| **Trust / proof** — fear of letting AI touch institutional money | Mandate caging + on-chain best-execution proof + replay verification. | on-chain evidence |

## AX — the AI's three concrete jobs

1. **Onboarding translation** — intent → on-chain mandate + initial positioning.
2. **RFQ / liquidity orchestration & smart execution** — source quotes, compare
   to oracle mid, route, atomic fill; slippage-bound gating (only fill within
   the mandate's allowed slippage vs mid, else freeze — no dumping into thin
   books).
3. **Post-trade TCA & monitoring narration** — fills vs mid, peg/liquidity
   flags, best-execution report.

The AI decides HOW to execute, never WHETHER to invest. Numbers stay
deterministic (clamp + on-chain checks); execution-quality and the audit
narrative are the LLM's measurable, irreplaceable work.

## Safety rails (the enabler, already built — makes it safe to let AI move money)

1. **Separation of powers** — agent key can ONLY call `rebalance()`/execute;
   never withdraw, transfer, or change the mandate. Total agent compromise =
   suboptimal in-bounds execution, never exfiltration.
2. **Mandate enforcement** — per-asset bounds, whitelist, cooldown, allowed
   slippage re-checked on-chain at execution; violations revert.
3. **Breach freeze** — drawdown floor vs HWM; permissionless trip. Default
   FREEZE (suspend the agent, hold positions — no forced dump into a crash);
   optional DERISK via RFQ only within the slippage bound. Crash protocol is
   itself a mandate field (the institution pre-commits its own policy).
4. **Evidence & best-execution proof** — every decision + execution logged with
   input snapshot, plan, fill vs mid; third-party replay via the shared module.
5. **Manager portability** — `setAgent()` swaps the execution agent without
   liquidation; track record accrues to the vault + ERC-8004 identity.

## The kick — Agent Arena (execution benchmarking)

Identical mandates, identical market data, different LLMs (gpt-oss vs qwen vs
llama), chain-scored on **execution quality**: slippage achieved, quote-selection
quality, mandate-compliance rate, breach response. We do not claim the winner
has alpha; we claim each agent's execution behavior is provably benchmarked.
This is the hackathon's own thesis — on-chain AI benchmarking, the "Turing
Test" — implemented as a product, now on the measurable axis (execution) rather
than the unmeasurable one (allocation).

## Security thesis

Assume the LLM is already jailbroken. Defense is futility, not prevention: max
reward of a successful jailbreak = suboptimal in-bounds execution + burning the
pre-committed risk budget (then the breach freeze fires). Zero exfiltration,
zero concealment (clamped deltas, reverts, and fill-vs-mid are on-chain attack
telemetry). Demo scene 1 IS a live jailbreak simulation.

## Why Mantle (necessity, not choice)

1. Mantle's own thesis is "the distribution layer connecting TradFi with
   on-chain liquidity" — we are the AI on-ramp that thesis was missing.
2. RFQ counterparties = the Bybit market-maker network Mantle is anchored to.
3. Native RWA collateral (USDY/mUSD, mETH, fBTC) lives here.
4. Radical auditability economics — KB of execution evidence per decision is
   cents on Mantle vs dollars on L1 (to be MEASURED from Sepolia gas receipts).
5. ERC-8004 agent identity is being standardized here (this hackathon).

## Business model

No token by design. Fee on flow (execution/management fee collected by the
contract). MNT value flows: recurring agent gas, sticky onboarded TVL,
native-asset demand.

## What judges receive (the 5 deliverables)

1. **Public GitHub repo** — contracts (Foundry), agent, verifier, clamp-core,
   web; README with architecture, measured gas economics, security model
   (hackathon-honest: reviewed + tested, not audited; demo MMs are ours; real
   MM network + mainnet prerequisites listed).
2. **Mantle Sepolia deployment** — factory + template vaults + RFQ venue,
   source-verified on mantlescan; addresses in README + submission.
3. **Live frontend (CF Pages)** — onboarding flow, vault list/detail, mandate
   visualization, execution timeline (plan, quotes, fill vs mid, improvement
   bps), behavior badges, Arena execution leaderboard, in-browser Verify.
4. **Demo video (≥2 min)** — scene 1 onboarding intent→mandate, scene 2 RFQ
   zero-slippage fill (quotes → best pick → atomic), scene 3 jailbreak→revert +
   breach freeze, scene 4 verify ✓ / tamper ✗ + arena leaderboard.
5. **Submission text** — RWA-track triage vocabulary up front (USDY/mETH,
   onboarding/execution/best-execution/risk), three smooth-goals, RFQ, rails,
   arena, fee model, Mantle necessity argument.

## Scorecard mapping

| Criterion | Answer |
|---|---|
| AI×RWA integration depth 15 | AI-driven execution & onboarding of USDY-family/mETH; output measurable (slippage/fill) and verifiable (rail 4) |
| Mantle integration 10 | AI on-ramp for Mantle's distribution thesis + Bybit-MM RFQ + measured gas + native assets |
| Compliance awareness 10 | Mandate=IPS, best-execution proof (TCA), deposit gating, on-chain audit trail |
| Path B application 10 | Defined assets, defined users (retail floor / institutional onboarding), end-to-end onboarding→execution UX |
| Execution & demo 5 | Deployed, verified, live site, repeatable RFQ + scenes |
| GC: ecosystem contribution | Onboards capital + liquidity onto Mantle; flows: agent gas, sticky TVL, native-asset & MM-network demand |

## Build status / remaining

DONE: contracts (26 tests) · clamp-core (13) · agent Bybit-first (44) ·
verifier (19) · web (38) · full local E2E rehearsal (3 scenes + sim + web).

REMAINING BUILD (≈1.5 days): **RFQ venue (EIP-712 signed quotes + atomic fill
behind ISwapVenue) + 2 demo MM bots + slippage-bound gating + TCA recording**
(new core pillar) · breach FREEZE/DERISK mode field · onboarding intent→mandate
flow · `--model` flag + arena execution runs · web upgrades (onboarding flow,
execution timeline w/ fill-vs-mid, leaderboard, behavior badges) · template
labels.

BLOCKED ON USER: Sepolia faucet (deployer 0x23128FBb…0528, agent
0x9b1f06e6…73b8) · OpenRouter key (agent/.env) · Etherscan key
(contracts/.env). Real-LLM path untested until the key arrives.

THEN: deploy+verify → arena/timeline population on Sepolia → CF Pages →
gas measurement → README/pitch → video → DoraHacks submission (buffer 6/15).
