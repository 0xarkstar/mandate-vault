# MandateVault

**The smooth on-ramp for institutional capital onto Mantle: AI executes, the
mandate protects, the chain proves best execution.**

MandateVault is an **AI-powered execution & onboarding rail** for RWA capital
— not an AI fund manager. The AI decides **HOW** capital moves (RFQ execution,
liquidity sourcing, onboarding translation), never **WHETHER** to invest. That
makes the AI's output objectively measurable: fill price vs oracle mid,
improvement bps, mandate-compliance — all recorded on-chain.

What custody (Fireblocks) did for *holding*, MandateVault does for *moving and
delegating* institutional capital on-chain. Track assets: **USDY/mUSD**
(T-bill stable, the safe sleeve) and **mETH** (Mantle's flagship LST).

> Full product definition: [docs/SUBMISSION.md](docs/SUBMISSION.md) ·
> contract design: [docs/DESIGN.md](docs/DESIGN.md) ·
> agent architecture: [docs/HARNESS.md](docs/HARNESS.md)

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

## Drawdown protection that doesn't panic-sell

The drawdown trip is permissionless (`tripCheck()`); its behavior is a
mandate field the depositor pre-commits:

- **FREEZE (default)** — suspend the agent, hold positions. No forced dump
  into a crash.
- **DERISK (opt-in)** — exit to the safe asset via the venue (RFQ-routed
  when quoted, oracle-mid fallback), never a market dump.

## Monorepo

```
contracts/   Foundry — MandateVault, VaultFactory, RFQVenue, mocks (41 tests)
agent/       TS daemon — deliberate/ (propose·review·gate·onboard),
             execute/ (legs·rfq·route·submit), learn/ (distill·PolicyIndex),
             mm/ demo market makers, tools/ (84 tests)
verifier/    third-party replay verification CLI (19 tests)
web/         Vite + React dashboard — vaults, decision timeline, cage
             diagram, TCA, Agent Arena (in-browser verification)
packages/    clamp-core (shared deterministic cage, 13 tests) · abi
```

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
- Contracts are **reviewed and tested, NOT audited**. Mock oracle and faucet
  tokens are testnet scaffolding.
- Mainnet prerequisites (explicitly out of scope here): security audit,
  multisig owner, decentralized oracle, real MM integrations
  (Hashflow-style), ERC-4626 virtual-offset share accounting.
- The learning engine ships as a thin slice (distill → PolicyIndex, version
  stamped into every decision snapshot). The full compounding loop is roadmap.

## Tests

`pnpm -r test` (TS: clamp-core 13 · verifier 19 · web 73 · agent 84) and
`cd contracts && forge test` (41) — 230 tests, all green at HEAD.
