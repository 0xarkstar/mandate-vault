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

`pnpm -r test` (TS: clamp-core 24 · verifier 22 · web 83 · agent 90) and
`cd contracts && forge test` (41) — **260 tests**, all green at HEAD.
