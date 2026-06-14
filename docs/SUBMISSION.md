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

No token by design — today. Fee on flow (1%/yr mgmt + 10% perf above T-bill
hurdle, live in the contract; every factory vault pays the platform). MNT
value flows: recurring agent gas, sticky onboarded TVL, native-asset demand.
Token stance (operator-amended 2026-06-13): issuance is permissible only
once organic fee flow exists to capture and a complete milestone structure
defines what the token captures — value-capture, never TVL-rental emissions.
Full reasoning + every positioning defense: docs/STRESS-TEST-QA.md.

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

## Honest boundaries (what we do NOT claim)

State these before a judge has to ask:

- **No chain-wide stability or MEV reduction.** Protection applies to flow
  routed through this rail (the vaults' own rebalances/liquidations and any
  taker using `fillSignedQuote`). Other pools' trades are untouched. The
  ecosystem effect is the *quality of capital that arrives* (rule-bound, no
  panic dumps, non-toxic flow), not a chain-level fix. Seatbelts don't make
  roads safer — they change who's willing to drive.
- **No alpha, ever.** The AI decides HOW capital moves, never WHETHER. The
  moment a vault promises arbitrage/returns it becomes a fund claiming alpha —
  the exact trap this design exists to dodge (operator's own market-making
  research: public logic is competed away; latency games need infra we don't
  claim to have).
- Demo MMs are ours (labeled). Learning engine ships as a thin slice +
  roadmap. Reviewed + tested, NOT audited. Testnet TCA (+4bps vs mid)
  demonstrates the mechanism, not market-beating execution.

## Cold start (the "who uses this first" answer)

The product needs NO network effect to deliver: depositor #1 gets the full
value (cage + RFQ execution + receipts) at TVL zero — unlike a DEX, value is
per-user. The one network dependency (MMs) is self-interested: vault rebalance
flow is uninformed, the flow MMs pay to fill.

1. **First niche: DAO/project treasuries on Mantle** — they already hold
   mUSD/mETH/MNT and have a real pain: treasury management that a community
   can *verify*, not just trust. Governance votes the mandate; anyone replays
   the decisions.
2. **Arena = the funnel.** "Same rules, same money, different AI brains —
   scored on-chain" is consumable spectacle before anyone deposits.
3. **On-chain track record replaces reputation** — the usual vault cold-start
   barrier (trust accrual time) is reduced by the product's own proof layer.

## Roadmap (the kick): we don't hunt — we sell the hunting ground and the maps

- **v1 (LIVE on Mantle Sepolia):** mandate cage + RFQ execution + replay
  verification + Agent Arena. Confidential decisions v0 (viewing-key selective
  disclosure: strategy context encrypted on-chain, integrity still publicly
  verifiable; auditors/LPs hold the key).
- **v2 — toxicity-aware venue:** every fill's markout is already on-chain
  (QuoteFilled TCA). Compile per-flow-source toxicity scores, publish them,
  let MMs tier quotes (vault flow tight, aggregator flow wide). Aggregator
  integration becomes safe *because* flow is priced by toxicity — the venue
  that prices poison instead of drinking it. Learning's honest ceiling
  (operator's research): classification & defense, never beating informed
  flow — so that is exactly what we build.
- **v3 — mandate prime brokerage:** lease mandate-caged capital to external
  operators who own real latency/infrastructure edge (arbitrageurs, MM desks).
  Their edge, our risk cage, fee-on-flow for the rail. Arena is the public
  selection mechanism for who gets capital. The venue NEVER prop-trades
  against its own flow — that conflict (the dark-pool scandal pattern) is
  constitutionally out, which is precisely why MMs can trust the data layer.
- **v2.5 — "dark pool with receipts":** zk-proven mandate compliance without
  revealing allocations (the clamp is a small arithmetic circuit; Mantle gas
  makes per-decision verification economical) + TEE-attested harness +
  sealed-bid RFQ. HumidiFi-class private execution, with the one thing dark
  pools never had: public proof of execution quality.

## Build status (2026-06-13)

ALL BUILT AND LIVE. 282 tests green (contracts 51 forge · agent 94 ·
web 89 · verifier 24 · clamp-core 24), tsc clean, E2E one-command
(`scripts/e2e-anvil.sh`).

- **Mantle Sepolia (chainId 5003), all 10 contracts source-verified on
  mantlescan**: factory `0xF6b02eaF2f3a08bEf0db2E2293C0B07eFf4BDB0f`,
  RFQVenue `0x6555A9429DCa1E0967744e0F55B2891E56f2D7d1` (full table in
  HANDOFF §6a).
- **Live story on-chain**: MandateViolation revert proven · epochs with real
  LLM proposals (gpt-oss-120b, gemma-4-31b) RFQ-filled at **+4bps vs oracle
  mid** (TCA on-chain) · honest deterministic-fallback epoch recorded
  (nemotron 429'd — and the snapshot says so) · FREEZE trip with positions
  held · third-party replay VERIFIED ✓ / 1-char tamper TAMPERED ✗.
- **Measured gas**: hold decision ~163k (0.021 MNT) · RFQ 2-fill decision
  272,949 gas (0.085 MNT, testnet 50 gwei; L1 data fee ~84%) — a fully
  logged, replay-verifiable AI decision costs cents on Mantle.
- **Dashboard live**: https://mandate-vault.pages.dev (vaults, cage diagram,
  TCA timeline, Arena leaderboard, in-browser Verify).
- **Repo public**: https://github.com/0xarkstar/mandate-vault

REMAINING: pitch text + 2-min video + DoraHacks submission (buffer 6/15,
deadline 6/16 00:59 KST).
