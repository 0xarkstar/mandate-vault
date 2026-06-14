# MandateVault

**The smooth on-ramp for institutional capital onto Mantle: AI executes, the
mandate protects, the chain proves best execution.**

MandateVault is an **AI-powered execution & onboarding rail** for RWA capital
— not an AI fund manager. The AI decides **HOW** capital moves (RFQ execution,
liquidity sourcing, onboarding translation), never **WHETHER** to invest. That
makes the AI's output objectively measurable: fill price vs oracle mid,
improvement bps, mandate-compliance — all recorded on-chain.

What custody (Fireblocks) did for *holding*, MandateVault does for *moving and
delegating* institutional capital on-chain. Posture: **T-bill floor, caged
carry** — every mandate anchors to a yield-bearing safe sleeve (USDY/mUSD,
~4-5% T-bill); risk (mETH, Mantle's flagship LST) only within bounds the
owner pre-committed.

**What this is NOT.** Not an LP, not an aggregator, not a fund. The deletion
test: swap our RFQ venue for any other execution venue and the product
survives intact (execution is replaceable plumbing — we built our own because
testnet had nothing to plug into); delete the mandate cage, the replay
verification, or the Arena and nothing remains. Unlike an LP, the vault's
composition is a function of *decision* (mandate-bounded), never of *price*
(x·y=k buying the falling asset); nobody can trade against its balances, and
it pays a small known spread instead of collecting fees for being picked off.

> Product definition: [docs/SUBMISSION.md](docs/SUBMISSION.md) ·
> contracts: [docs/DESIGN.md](docs/DESIGN.md) ·
> agent harness: [docs/HARNESS.md](docs/HARNESS.md) ·
> **security model + self-audit register: [docs/SECURITY.md](docs/SECURITY.md)** ·
> **every hard objection, answered: [docs/STRESS-TEST-QA.md](docs/STRESS-TEST-QA.md)** ·
> submission blocks: [docs/PITCH.md](docs/PITCH.md)

## How it works — three engines, three clocks

| Engine | Clock | Decides | LLM |
|---|---|---|---|
| Learning | minutes–hours, background | how to improve (PolicyIndex vN) | yes |
| Deliberation | ~1/decision cycle | WHAT (the intent) | yes — proposer **≠** reviewer |
| Execution | milliseconds | HOW (the fill) | **never** |

**The execution path never touches an LLM.** A proposal flows:
LLM proposes → a *different* model adversarially reviews → a deterministic
gate resolves to act-or-hold → clamp cages the target inside the mandate →
**RFQ engine** collects signed EIP-712 quotes from market makers, picks the
best vs oracle mid, gates on slippage (freeze, never dump) → the vault's
`rebalance()` re-checks every bound **on-chain** and settles the fill
vault↔MM atomically at the quoted price → `QuoteFilled` records the TCA
(fill vs mid, improvement bps) on-chain.

Every decision is logged with its full input snapshot, raw proposal, and
playbook version — any third party can replay and verify it
(`verifier/`, or the in-browser Verify button).

## Using it — the first five minutes

Browse vaults (no wallet needed) → open one and read its *contract*, not a
prospectus: mandate card (bounds, "On breach: FREEZE"), separation-of-powers
card, full decision timeline with fill-vs-mid badges → click **🔍 Verify**
and watch your browser recompute the hashes and replay the clamp → connect
a wallet (Mantle Sepolia; faucet mint built into the deposit panel) →
approve + deposit → done. You never operate anything; the agent runs, the
timeline grows, and you can withdraw to the safe asset at any time.
Institutions/DAOs: `createCustomVault(mandate)` is permissionless — your
rules, your agent (`setAgent` swaps managers without liquidation), optional
`VIEWING_KEY` for confidential strategy context.

## Drawdown protection that doesn't panic-sell

The drawdown trip is permissionless (`tripCheck()`); its behavior is a
mandate field the depositor pre-commits:

- **FREEZE (default)** — suspend the agent, hold positions. No forced dump
  into a crash.
- **DERISK (opt-in)** — exit to the safe asset via the venue (RFQ-routed
  when quoted, oracle-mid fallback), never a market dump.

**Withdrawals are NEVER blocked — not tripped, not killed.** That is a code
invariant, not a policy: an abandoned vault dies, the money walks out. The
owner cannot withdraw depositors' funds (no such function exists), so the
worst an absent or hostile owner can do is leave a vault frozen — with every
depositor free to exit to the safe asset.

## Monorepo

```
contracts/   Foundry — MandateVault, VaultFactory, RFQVenue, mocks (51 tests)
agent/       TS daemon — deliberate/ (propose·review·gate·onboard),
             execute/ (legs·rfq·route·submit), learn/ (distill·PolicyIndex),
             mm/ demo market makers, confidential payloads, tools/ (94 tests)
verifier/    third-party replay verification CLI, viewing-key aware (24 tests)
web/         Vite + React dashboard — vaults, decision timeline, cage
             diagram, TCA, Agent Arena (in-browser verification) (89 tests)
packages/    clamp-core (shared cage + confidential envelopes, 24 tests) · abi
```

## Economics (live in the contract today)

Every vault minted by the factory — template or custom — pays the platform
**1%/yr management** (share dilution, accrued per rebalance) and **10%
performance above a 4.5%/yr T-bill hurdle** (high-water-mark). Revenue is
linear in TVL — asset management's most proven model; the ceiling is
go-to-market, not architecture. **No token**, by design: value lands in
Mantle-native assets (gas, mandate demand for mUSD/mETH/MNT, sticky TVL).
Any future token must capture organic fee flow at defined milestones —
emissions that rent TVL are permanently out.

Mainnet asset map (testnet mocks are address-swap stand-ins, zero structural
change): mUSD → **USDY**/USDT (T-bill floor) · mMETH → **mETH/cmETH** =
Mantle's official LST/restaking · mMNT → WMNT (+ Rewards Station). Each
sleeve has a real yield source; pair-vaults (ETH↔mETH, USDT↔USDY) are just
mandates with peg-risk bounds.

## Agent Arena — live results

Same rails, different brains, scored on-chain on **execution quality**
(50% fill improvement vs mid · 30% cage discipline · 20% autonomy — never
alpha). Live Sepolia leaderboard after two rounds: **gpt-oss-120b** and
**gemma-4-31b** made real proposals and filled at +4bps vs mid;
**nemotron-3-ultra**'s free tier rate-limited both rounds, the agent fell
back to its deterministic path, the chain recorded it honestly — and it
ranks last on autonomy. That honesty trail *is* the benchmark.

## Quickstart (local anvil, no external keys needed)

```bash
pnpm install && export PATH="$HOME/.foundry/bin:$PATH"
bash scripts/e2e-anvil.sh
```

That single script rehearses the whole story: deploy → deposit → decision
(deliberation → clamp → RFQ fill + TCA) → scene 1 out-of-bounds proposal
reverts on-chain → scene 2 RFQ best-quote fill → learning pass compiles
PolicyIndex v1 → scene 3 crash + FREEZE trip → scene 4 third-party replay
(VERIFIED, then TAMPERED on a 1-char mutation) → web build.

## Honesty notes (read this)

- **The two RFQ market makers in the demo are OURS** (`agent/src/mm/demo-mm.ts`,
  labeled `demo-mm-tight` / `demo-mm-wide`). They sign real EIP-712 quotes and
  settle from their own inventory through the same contract path a real MM
  would use — but they are demo liquidity, not independent counterparties.
- Contracts are **reviewed and tested, NOT audited**. We ran an 11-dimension
  multi-agent self-audit with adversarial verification and **publish every
  finding** (severity + disposition + mainnet remedy) in
  [docs/SECURITY.md](docs/SECURITY.md) — including a disclosed HIGH
  griefing surface on `postQuote`. Core money invariants (withdraw never
  blocked, no owner drain, agent rebalance-only, bounds re-check, no-LLM
  execution) were verified to hold. Mock oracle and faucet tokens are testnet
  scaffolding.
- Mainnet prerequisites (explicitly out of scope here): security audit,
  multisig owner, decentralized oracle, real MM integrations
  (Hashflow-style), ERC-4626 virtual-offset share accounting.
- The learning engine ships as a thin slice (distill → PolicyIndex, version
  stamped into every decision snapshot). The full compounding loop is roadmap.
- The one real open bet, stated: *will institutions/DAOs actually delegate
  capital to AI agents under mandates?* Everything else resolves mechanically
  if capital comes. Full objection register: docs/STRESS-TEST-QA.md.

## Confidential decisions (privacy-lite)

Set `VIEWING_KEY` (64 hex chars) in `agent/.env` and the three published
decision payloads (input snapshot, raw proposal, rationale) go on-chain as
**AES-256-GCM envelopes** instead of plaintext. The hashes commit to the
published envelopes, so public integrity verification is unchanged — but
content verification (schema + clamp replay) requires the key:

```bash
# auditor / LP (holds the key): full verification
tsx src/cli.ts --vault 0x… --epoch 1 --viewing-key <64-hex>
#   → 🔒 VERIFIED ✓ (confidential — decrypted + replayed)

# public (no key): integrity + execution quality only
tsx src/cli.ts --vault 0x… --epoch 1
#   → 🔒 INTEGRITY VERIFIED ✓ (content confidential)
```

What stays public by design: final allocations (the chain enforces them),
timing, TCA fill quality, and the `llmFallback`/`playbookVersion` flags
("a real model reasoned" / "playbook vN was used") — outsiders see *that*
the AI worked and *how well* it executed, never *what it saw or why*.
The in-browser Verify button accepts the key the same way. Full zk-proven
compliance (hide even the allocations) is roadmap — see docs/SUBMISSION.md.

**Try it live**: the Sepolia confidential demo vault's viewing key is
published below on purpose — pretend you are the LP.

## Live on Mantle Sepolia (all contracts source-verified)

| | |
|---|---|
| Dashboard | https://mandate-vault.pages.dev |
| VaultFactory | `0xF6b02eaF2f3a08bEf0db2E2293C0B07eFf4BDB0f` |
| RFQVenue | `0x6555A9429DCa1E0967744e0F55B2891E56f2D7d1` |
| Demo vault (FREEZE-tripped, 3 epochs) | `0xBd5A3F03ed0488262b4bE31d9854CaF3c442de14` |
| Confidential demo vault (encrypted epoch 1, RFQ-filled +4bps) | `0x0AEfA5D20544499680aa2E4662EE9f171E0B747a` |
| Demo viewing key (public on purpose) | `4d616e646174655661756c7420436f6e666964656e7469616c2044656d6f4b31` |

On-chain story: `MandateViolation` revert proven live · real-LLM epochs
(gpt-oss, gemma) RFQ-filled at **+4bps vs oracle mid** with on-chain TCA ·
honest deterministic-fallback epochs recorded when a free model 429'd ·
FREEZE trip with positions held · replay VERIFIED ✓ / tamper TAMPERED ✗ ·
measured cost **~163k–273k gas (0.02–0.085 MNT testnet) per fully logged,
replay-verifiable AI decision**.

## Tests

`pnpm -r test` (TS: clamp-core 24 · verifier 24 · web 89 · agent 94) and
`cd contracts && forge test` (51) — **282 tests**, all green at HEAD.
