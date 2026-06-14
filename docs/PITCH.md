# DoraHacks BUIDL — paste-ready blocks

> Copy each block into the corresponding form field. Track: **AI x RWA**.
> Derived from docs/SUBMISSION.md (positioning frozen) + final pre-submission
> review. Keep the honesty lines — they are scoring assets.

## Project name

MandateVault

## One-liner / tagline

The trust rail for AI-delegated capital on Mantle: the mandate cages the AI,
RFQ kills slippage and MEV, the chain proves best execution.

## Short description (~100 words)

MandateVault lets capital be delegated to AI agents without trusting them.
A depositor writes an investment mandate (asset whitelist, per-asset bounds,
drawdown limit) that the contract itself enforces — out-of-bounds AI proposals
revert on-chain. Execution routes through signed RFQ quotes, so rebalances
never touch a public mempool: no sandwiches, no slippage curves, and every
fill's price-vs-mid is recorded on-chain (TCA). Any third party can replay
and verify every decision. Live on Mantle Sepolia with real LLM agents
(gpt-oss, gemma, nemotron) benchmarked on-chain in the Agent Arena — scored
on execution quality, never alpha.

## Full description

**What this is NOT (read first).** Not an LP, not an aggregator, not a fund.
The deletion test: remove our RFQ venue and plug in any other execution venue
— the product survives intact (execution is replaceable plumbing; on testnet
we built our own because nothing existed to plug into). Remove the mandate
cage, the replay verification, or the Arena — nothing is left. The product is
the **delegation rail**: chain-enforced limits + provable behavior +
benchmarked operators. Each piece exists somewhere (Enzyme has vaults,
Hashflow has RFQ, nobody has the assembled rail). And the liquidity story is
sequenced, not overclaimed: **v1 imports capital** (vault deposits are Mantle
TVL; recurring uninformed rebalance flow is the bait that brings professional
MMs — no pool lockup, no IL, per-trade pricing, benign flow); **v3 converts
that capital into liquidity supply** (mandate prime brokerage: caged vault
capital leased as MM inventory — with limits and receipts attached).

**The problem.** Institutions and treasuries want on-chain RWA exposure
(USDY-family stables, mETH), and automation is increasingly AI-shaped. But
nobody sane gives an AI a private key: it might exceed limits, panic-sell,
get jailbroken, or simply be unauditable. Meanwhile, on-chain execution
itself is hostile — predictable rebalance flow on public AMMs gets
sandwiched and bleeds slippage. There is no infrastructure that makes
AI-delegated capital *safe, well-executed, and provable* at the same time.

**What MandateVault does.** Three layers in one rail:

1. **The cage (mandate enforcement).** The depositor's rules — asset
   whitelist, per-asset min/max allocation, drawdown limit, rebalance
   cooldown, trip behavior — live in the vault contract. The AI's only
   permission is `rebalance()`, and every call re-checks every bound
   on-chain. The agent key cannot withdraw, transfer, or change rules.
   On a drawdown breach, anyone can trigger the trip: default **FREEZE**
   (suspend the agent, hold positions — no forced dump into a crash).
   Worst case of a fully jailbroken AI = suboptimal allocation *inside*
   the bounds.

2. **The execution (RFQ, no LLM on this path).** Rebalances request signed
   EIP-712 quotes from market makers off-chain, pick the best vs oracle mid,
   gate on slippage (fail → hold, never dump), and settle vault↔MM
   atomically at the signed price. Nothing tradeable ever appears in a
   public mempool — the price is fixed by signature before the chain sees
   anything, so there is nothing to sandwich. Every fill emits
   `QuoteFilled(fill, oracleMid, improvementBps)`: transaction-cost analysis
   as an on-chain primitive.

3. **The proof.** Every decision logs its full input snapshot, the AI's raw
   proposal, the rationale, and the playbook version it used. A standalone
   verifier (CLI + in-browser button) replays the hashes and the clamp from
   chain data alone: VERIFIED, or TAMPERED on a single flipped character.

**The harness (how the AI is actually used).** Three engines on three
clocks: a deliberation engine (LLM proposes, a *different* model
adversarially reviews, a deterministic gate resolves to act-or-hold), an
execution engine (pure arithmetic — the hot path never touches an LLM), and
a background learning engine that distills the on-chain decision log into a
versioned PolicyIndex. Every decision records which playbook version it
used, so past decisions replay against the policy they actually had.

**Agent Arena (this hackathon's thesis, as a product).** Identical rails,
different brains: template vaults pinned to different free LLMs, scored
on-chain on execution quality — fill improvement vs mid, cage discipline,
autonomy. When one model's free tier rate-limited mid-run, the agent fell
back to its deterministic path and the snapshot *records that honestly* —
and the leaderboard ranks it last on autonomy. On-chain AI benchmarking,
on the measurable axis (execution), not the unmeasurable one (allocation).

**Live now (Mantle Sepolia, all contracts source-verified):**
- Real-LLM decisions filled at **+4bps vs oracle mid**, TCA on-chain
- MandateViolation revert proven live (the cage holds)
- FREEZE trip executed live (crash → positions held, agent suspended)
- Replay verification VERIFIED ✓ / tamper detection TAMPERED ✗ on live data
- Measured cost: **~163k–273k gas (~0.02–0.085 MNT testnet) per fully
  logged, replay-verifiable AI decision** — auditability is economical on
  Mantle and on Mantle only
- Confidential decisions v0: strategy context encrypted on-chain with
  viewing-key selective disclosure (auditor/LP verifies everything; the
  public verifies integrity + execution quality)

**What we deliberately do NOT claim.** No alpha — the AI decides HOW
capital moves, never WHETHER (public trading logic is competed away; we
don't pretend otherwise). No chain-wide MEV fix — protection applies to
flow routed through this rail; the ecosystem benefit is the *quality* of
capital it lets in: rule-bound, panic-proof, non-toxic. Demo MMs are ours,
labeled. Reviewed and tested, not audited.

**Why Mantle.** The assets are here (USDY-family mUSD, mETH), the
Bybit-anchored MM network RFQ needs is here, ERC-8004 agent identity is
being standardized here, and per-decision auditability costs cents here
versus dollars on L1. As tokenized stocks and ETFs land on Mantle, each new
asset is one more line in a mandate — the rail's usefulness compounds with
the RWA catalogue.

**Business model — exact, and live in the contract today.** No token, by
design (any future token must capture organic fee flow at defined
milestones — never emissions that rent TVL). Every vault minted by the factory — template or custom — pays the
platform (feeRecipient is fixed to the factory owner): **1%/yr management
fee** (share dilution, accrued each rebalance) + **10% performance fee on
gains above a 4.5%/yr T-bill hurdle** (high-water-mark, no double-charging).
Revenue scales with TVL, which is why the entire product optimizes for one
variable: capital's willingness to come. Roadmap revenue (not yet in code,
say so): per-fill venue fee, toxicity-data subscriptions (v2), prime-
brokerage fees (v3).

**Mainnet asset map (testnet mocks are stand-ins — swap addresses, zero
structural change).** Each sleeve has a REAL yield source on Mantle:

| Sleeve | Testnet stand-in | Mainnet asset | Real yield |
|---|---|---|---|
| Safety floor | mUSD | **USDY** (Ondo T-bill) + USDT/USDC | ~4-5% T-bill |
| Carry | mMETH | **mETH / cmETH** — Mantle's official LST/restaking | ~3-4% staking |
| Treasury | mMNT | WMNT (+ Rewards Station) | MNT incentives |

Holding mETH in a mandate IS the connection to Mantle's official staking —
"T-bill floor, caged carry." Pair-vaults (ETH↔mETH, USDT↔USDY) are just
mandates with peg-risk bounds.

**Known-unresolved register (we list these before you ask).** Mock oracle →
Chainlink/Pyth on mainnet · demo MMs ours → permissionless quotes + benign
flow recruit real MMs · single-EOA owner → multisig/governance + timelocked
resume (depositor withdrawals are NEVER blocked, even tripped/killed — the
escape hatch is a code invariant, not a promise) · per-fill venue fee
switch → small contract change · unaudited → audit before mainnet.

**Roadmap — we don't hunt; we sell the hunting ground and the maps.**
v2: toxicity-aware venue — per-flow markout scores compiled from on-chain
TCA, published so MMs can tier quotes (vault flow tight, aggregator flow
wide); the venue prices poison instead of drinking it. v2.5: "dark pool
with receipts" — zk-proven mandate compliance without revealing allocations,
TEE-attested harness, sealed-bid RFQ. v3: mandate prime brokerage — lease
caged capital to operators with real latency edge; their edge, our cage,
fee-on-flow for the rail; Arena selects who gets capital. The venue never
prop-trades against its own flow — that conflict is constitutionally out.

## Links

- Live dashboard: https://mandate-vault.pages.dev
- Repo (public): https://github.com/0xarkstar/mandate-vault
- Factory (verified): https://sepolia.mantlescan.xyz/address/0xF6b02eaF2f3a08bEf0db2E2293C0B07eFf4BDB0f
- RFQVenue (verified): https://sepolia.mantlescan.xyz/address/0x6555A9429DCa1E0967744e0F55B2891E56f2D7d1
- Demo video: (add after recording)

## Tech stack

Solidity 0.8.24 (Foundry) · TypeScript agent (viem, zod, OpenRouter free
models) · standalone verifier CLI + in-browser verification (shared
clamp-core) · Vite + React 19 dashboard · Mantle Sepolia · 282 tests.

## Track vocabulary (for triage)

AI x RWA · USDY/mUSD · mETH · onboarding · best execution · TCA ·
investment mandate (IPS) · drawdown protection · RFQ · MEV-protected ·
verifiable AI · ERC-8004 · agent benchmarking (Arena).
