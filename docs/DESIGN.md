# MandateVault — Design Document

> Technical design of the contracts + system, **as built and deployed**.
> Companion docs: agent harness → [HARNESS.md](HARNESS.md); product/positioning
> → [SUBMISSION.md](SUBMISSION.md); security model + audit register →
> [SECURITY.md](SECURITY.md); objection register → [STRESS-TEST-QA.md](STRESS-TEST-QA.md).
> Target: Mantle Turing Test Hackathon 2026, AI × RWA track. Updated 2026-06-13.

## Verified facts

| Fact | Value |
|---|---|
| Mantle Sepolia chainId | **5003** (0x138b), rpc `https://rpc.sepolia.mantle.xyz` |
| Explorer | `https://sepolia.mantlescan.xyz` (Etherscan-family; verify via V2 API, chainid=5003) |
| RPC quirk | `eth_getLogs` rejects >10k-block ranges → verifier chunks; public RPC rate-limits bursts → batch + multicall3 |
| LLM (truly-free, $0) chain | `openai/gpt-oss-120b:free` → `nvidia/nemotron-3-super-120b-a12b:free` → `google/gemma-4-31b-it:free` (live-verified 2026-06-13; qwen3-next/llama-3.3 free tiers were upstream-429ing) |
| Funding feed | **Bybit v5** primary (`/v5/market/funding/history` + `/v5/market/tickers`, keyless; Bybit = Mantle ecosystem exchange), Binance failover so a demo never stalls |

## Architecture — three engines, three clocks

The execution path **never touches an LLM**. See HARNESS.md for the full agent
design; the system view:

```
                         ┌──────────────────────── Mantle Sepolia ───────────────────────┐
  Owner ──set mandate──▶ │  VaultFactory ──creates──▶ MandateVault (per-vault)            │
  Depositor ──deposit──▶ │                            ├ mandate (assets, bounds, tripMode)│
  Anyone ──tripCheck()─▶ │  on-chain bounds RE-CHECK  ├ shares / fees / HWM               │
                         │  DecisionLogged + Data evt ├ rebalance() agent-only            │
  Agent ──rebalance────▶ │  QuoteFilled (TCA) evt     │                                   │
   ▲  (HOW, no LLM)      │  RFQVenue ◀── signed EIP-712 quotes ── MM bots                 │
   │                     │  MockOracle (demo setter)  ·  Mock mUSD/mMETH/mMNT             │
   │                     └───────────────────────────────────────▲───────────────────────┘
   │  DELIBERATION (LLM): propose (model A) → review (model B)    │ events (snapshot JSON,
   │     → deterministic gate → ExecutionIntent                   │ or AES-GCM envelope)
   │  EXECUTION (no LLM): legs → RFQ collect/route/gate → submit  │
   │  LEARNING (background): on-chain log → PolicyIndex vN ───────┘
   ▼
 clamp-core (pure TS, SHARED by agent · verifier · web)
```

**Core claim:** the LLM is free to propose; the cage is verifiable. Enforcement
layers (full threat model in SECURITY.md): off-chain clamp → reviewer veto →
on-chain bounds re-check → autonomous breach freeze → no LLM on the execution
path. Every decision emits its full input snapshot + raw proposal + rationale on
chain (plaintext, or an encrypted envelope under privacy-lite); anyone recomputes
the keccak hashes + replays the clamp from event data → ✓ / ✗.

## Repo layout (pnpm workspace + Foundry)

```
mandate-vault/
├── contracts/   Foundry — MandateVault, VaultFactory, RFQVenue, Mock{ERC20,Oracle,Venue}
│                interfaces/{IPriceOracle,ISwapVenue,IAgentIdentity}; script/Deploy.s.sol
├── packages/clamp-core/  pure TS — schema, clamp, canonical JSON, keccak, confidential envelopes
├── agent/       deliberate/ · execute/ (no LLM) · learn/ · mm/ · confidential.ts · tools/
├── verifier/    CLI: fetch events → recompute hashes + replay clamp → ✓/✗/INDETERMINATE; viewing-key aware
├── web/         Vite + React 19 + viem; CF Pages — vaults, cage diagram, TCA timeline, Arena, in-browser Verify
├── scripts/     e2e-anvil.sh + demo scenes 1-4
└── docs/        DESIGN · HARNESS · SUBMISSION · SECURITY · STRESS-TEST-QA · PITCH · VIDEO-SCRIPT
```

## Contract specs (as deployed)

### MandateVault

```solidity
enum TripMode { FREEZE, DERISK }          // FREEZE = default
struct Mandate {
    address[] assets;        // whitelist; assets[0] = SAFE asset (mUSD/USDY)
    uint16[]  minBps; uint16[] maxBps;     // per-asset bounds
    uint16    maxDrawdownBps;              // vs share-price high-water mark
    uint32    rebalanceCooldown;           // seconds
    uint16    mgmtFeeBpsPerYear;           // accrued as share dilution
    uint16    perfFeeBps;                  // on gain above hurdle-adjusted HWM
    uint16    hurdleBpsPerYear;            // T-bill baseline hurdle, pro-rated
    address   agent;                       // ONLY caller of rebalance()
    TripMode  tripMode;                    // breach behavior
}
```

- `deposit(amount)` / `withdraw(shares)` — mUSD in/out (v0); first-deposit floor +
  dead shares (inflation defense). **`withdraw()` is never blocked** — callable
  when tripped or killed (verified invariant; depositors can always exit).
- `rebalance(targetBps, snapshotJson, rawProposalJson, rationale)` — agent-only;
  re-checks `msg.sender==agent`, `!killed`, `!tripped`, cooldown, length,
  Σ=10000, and `minBps[i] ≤ targetBps[i] ≤ maxBps[i]` for **every** asset (else
  `MandateViolation(i)`); accrues fees; on drawdown breach **trips instead of
  executing**; settles swaps via the venue; emits `DecisionLogged` (3 keccak
  hashes + clampedBps) + `DecisionData` (full payload) + (RFQ) `QuoteFilled` (TCA).
- `tripCheck()` — permissionless; on breach: **FREEZE** suspends the agent and
  **holds positions** (no forced dump), **DERISK** sells every sleeve to the safe
  asset via the venue. Cleared only by owner `resume()` (resets HWM).
- Owner-only: `kill` (permanent agent lockout; withdrawals still work),
  `resume`, `setAgent` (manager swap, no liquidation), `setMandateBounds`,
  `setAgentIdentity` (ERC-8004 stub). **No owner function moves depositor funds.**

### RFQVenue (the execution pillar) — behind `ISwapVenue`

- EIP-712 `Quote{assetIn, assetOut, amountIn, amountOut, expiry, mm, nonce}`.
- `postQuote(q, sig)` — verifies signature, expiry, per-MM nonce (replay
  protection), EIP-2 low-s; stores the active quote per directed pair.
- `swap(assetIn, assetOut, amountIn)` — consumes a valid posted quote pro-rata
  (atomic vault↔MM settle at the signed price); else **oracle-mid fallback** from
  venue reserves so autonomous paths never strand.
- `fillSignedQuote(q, sig)` — direct taker path (verify + settle in one call).
- Every fill emits `QuoteFilled(mm, …, oracleMidOut, improvementBps)` = on-chain
  TCA. Known limitation SEC-1 (permissionless `postQuote`) is disclosed in
  SECURITY.md with the mainnet remedy.

### VaultFactory & mocks

- `createVault(templateId, agent)` (0 Conservative / 1 Balanced / 2 Aggressive) and
  `createCustomVault(Mandate)` — both **permissionless**; `feeRecipient` is always
  the factory owner (every vault pays the platform).
- Templates: Conservative mUSD 70-100% / mMETH 0-30% / DD 5%; Balanced 30-100% /
  0-70% / DD 10%; Aggressive (3-asset incl. MNT) 20-100 / 0-80 / 0-20 / DD 15%.
- `MockERC20` (open faucet mint), `MockOracle` (owner setPrice), `MockVenue`
  (oracle-priced, retained for tests) — testnet-only, labeled; mainnet swaps in
  real token addresses, a decentralized oracle, and a real RFQ/AMM venue.

## clamp-core (shared by agent · verifier · web)

- `ProposalSchema` / `SnapshotSchema` / `MandateBoundsSchema` (zod). Snapshot
  carries optional `llmFallback` + `playbookVersion`.
- `clamp(targetBps, bounds) → {clampedBps, violations}` — per-asset clamp + sum
  repair to Σ=10000 within bounds (deterministic; safe-first deficit repair).
- `canonicalJson` (sorted-key stable; byte-matches what the agent submits) +
  `hashString` (keccak, matches solidity `keccak256(bytes(s))`).
- `confidential.ts` — AES-256-GCM envelopes (WebCrypto): privacy-lite encrypts
  the published payloads under a viewing key; the on-chain hashes commit to the
  **published** envelope, so integrity verification is unchanged and a key-holder
  decrypts to byte-identical canonical strings for full schema + clamp replay.

## Verifier (TS CLI + in-browser)

`verify --vault 0x.. --epoch N [--tamper] [--viewing-key …]`: fetch
DecisionLogged + DecisionData → recompute the three keccak hashes → re-parse +
replay the clamp → **VERIFIED** / **TAMPERED** (hash break) / **INDETERMINATE**
(hashes intact but clamp differs — mandate bounds may have changed since the
epoch) / **🔒 INTEGRITY VERIFIED** (confidential, no key). The same `doVerify`
runs in the browser Verify button via clamp-core.

## Demo scenes (scripts/) & full E2E

`bash scripts/e2e-anvil.sh` rehearses the whole story on a fresh local anvil.
Individual scenes:
1. `scene1-violation.sh` — agent `--violate` → on-chain `MandateViolation` revert.
2. `scene2-rfq.sh` — RFQ: signed quotes → best pick → atomic fill + TCA.
3. `scene3-drawdown.sh` — oracle crash → `tripCheck()` → FREEZE (positions held).
4. `scene4-verify.sh` — verifier ✓ on a real epoch, then `--tamper` → ✗.

## Deployed (Mantle Sepolia, source-verified on mantlescan)

VaultFactory `0xF6b02eaF2f3a08bEf0db2E2293C0B07eFf4BDB0f` · RFQVenue
`0x6555A9429DCa1E0967744e0F55B2891E56f2D7d1` · demo vault
`0xBd5A3F03ed0488262b4bE31d9854CaF3c442de14` · confidential vault
`0x0AEfA5D20544499680aa2E4662EE9f171E0B747a`. Dashboard
https://mandate-vault.pages.dev. Repo https://github.com/0xarkstar/mandate-vault.

## Business model & scope

No token today (value lands in Mantle-native assets; fee-on-flow: 1%/yr mgmt +
10% perf above a 4.5% T-bill hurdle, live in the contract). A future token is
permissible only against organic fee flow at defined milestones — never
TVL-rental emissions (see STRESS-TEST-QA.md). Mainnet prerequisites
(audit, multisig owner, decentralized oracle, real MMs, SafeERC20, the SEC-*
hardening) are listed in SECURITY.md, none claimed as done.
