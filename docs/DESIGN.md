# MandateVault — Design Document

> Authoritative spec: `~/Projects/.omc/specs/deep-interview-mandate-vault.md` (AC-1..AC-15).
> This file locks the technical design. Target: Mantle Turing Test Hackathon 2026, AI x RWA track.
> Deadline: 2026-06-16 00:59 KST.

## Verified Facts (2026-06-11)

| Fact | Value | Verified via |
|---|---|---|
| Mantle Sepolia chainId | **5003** (0x138b) | `eth_chainId` on rpc.sepolia.mantle.xyz |
| RPC | `https://rpc.sepolia.mantle.xyz` | live, block ~39.8M |
| Explorer | `https://sepolia.mantlescan.xyz` (Etherscan family) | HTTP 200; verify via Etherscan V2 API (free key, chainid=5003) |
| Explorer fallback | explorer.sepolia.mantle.xyz (Blockscout) | 503 at check time — unreliable |
| OpenRouter free models | `openai/gpt-oss-120b:free` → `qwen/qwen3-next-80b-a3b-instruct:free` → `meta-llama/llama-3.3-70b-instruct:free` (fallback chain) | /api/v1/models |
| Funding feed PRIMARY (no key) | Bybit v5: `/v5/market/funding/history?category=linear&symbol=ETHUSDT` + `/v5/market/tickers` | live JSON (2026-06-12); Bybit = Mantle ecosystem exchange (co-host) |
| Funding feed FALLBACK (no key) | Binance: `/fapi/v1/fundingRate` + `/fapi/v1/premiumIndex` | live JSON; failover so a demo never stalls on one venue |

## Architecture

```
                         ┌─────────────────────────────────────────┐
                         │              Mantle Sepolia             │
                         │                                         │
  Owner ──set mandate──▶ │  VaultFactory ──creates──▶ MandateVault │
  Depositor ──deposit──▶ │   (templates)              ├ mandate    │
                         │                            ├ sleeves    │
  Agent ──rebalance────▶ │  on-chain bounds RE-CHECK  ├ fees       │
   │                     │  DecisionLogged + Data evt ├ trip/kill  │
   │                     │  MockERC20 mUSD/mMETH/mMNT │            │
   │                     │  MockOracle (demo setter)  │            │
   │                     │  MockVenue (oracle-price swap)          │
   │                     └─────────────────▲───────────────────────┘
   │                                       │ events (snapshot JSON on-chain)
   │  inputs: Binance funding (real REST), │
   │  oracle prices, vault state           │
   ▼                                       │
 LLM (OpenRouter free, structured JSON) ───┤
   │ rawProposal {regime, targetBps[],     │
   │              rationale}               │
   ▼                                       │
 clamp-core (pure TS, SHARED) ── verifier CLI / web Verify button
   clamped = min(max(target, minBps), maxBps), renormalize, Σ=10000
```

**Core claim**: the LLM is free; the cage is verifiable. Three enforcement layers:
1. Off-chain clamp (clamp-core) — LLM proposal clamped to mandate before tx.
2. On-chain re-check — `rebalance()` reverts on any bounds violation (even a buggy/hostile harness cannot escape).
3. Automatic trip — drawdown breach forces de-risk to safe asset + agent suspension, no human in the loop.

Replay verification: full input snapshot + raw proposal + rationale are emitted **on-chain** (testnet gas ≈ free; mainnet → calldata/IPFS, documented as roadmap). Anyone recomputes hashes + clamp from event data → ✓/✗.

## Repo Layout (pnpm workspace + Foundry)

```
mandate-vault/
├── contracts/            # Foundry
│   ├── src/{MandateVault,VaultFactory,MockERC20,MockOracle,MockVenue}.sol
│   ├── src/interfaces/IAgentIdentity.sol     # ERC-8004 adapter stub
│   ├── test/*.t.sol
│   └── script/Deploy.s.sol
├── packages/clamp-core/   # pure TS: schema, clamp, canonical JSON, keccak hashing
├── agent/                 # feeds → LLM → clamp → tx; modes: once|sim|loop
├── verifier/              # CLI: fetch events → recompute → ✓/✗ (+ --tamper demo)
├── web/                   # Vite+React+wagmi/viem; CF Pages
├── scripts/               # demo scenes 1-3, timeline populate, faucet mint
└── docs/                  # DESIGN.md, PITCH.md, VIDEO_SCRIPT.md
```

## Contract Specs

### MandateVault (per-vault, deployed by factory)

```solidity
struct Mandate {
    address[] assets;        // whitelist; assets[0] = SAFE asset (mUSD)
    uint16[]  minBps;        // per-asset lower bound
    uint16[]  maxBps;        // per-asset upper bound
    uint16    maxDrawdownBps;        // vs share-price high-water mark
    uint32    rebalanceCooldown;     // seconds
    uint16    mgmtFeeBpsPerYear;     // accrued as share dilution on rebalance
    uint16    perfFeeBps;            // on gain above HWM * hurdle accrual
    uint16    hurdleBpsPerYear;      // USDY-baseline hurdle, pro-rated
    address   agent;                 // only caller of rebalance()
}
```

- `deposit(uint256 amountSafeAsset)` / `withdraw(uint256 shares)` — deposits in mUSD only (v0 simplification); share price = totalValueUSD / totalShares (1e18); first deposit 1:1.
- `rebalance(uint16[] targetBps, string snapshotJson, string rawProposalJson, string rationale)`:
  - require: msg.sender == agent, !killed, !tripped, cooldown elapsed, targetBps.length == assets.length, Σ targetBps == 10000, minBps[i] ≤ targetBps[i] ≤ maxBps[i] (else `MandateViolation(i)`)
  - accrue mgmt fee (time-prorated share dilution to feeRecipient), check drawdown → maybe trip instead
  - execute swaps via MockVenue to reach target allocation (oracle-priced)
  - perf fee if sharePrice > HWM*(1 + hurdle·Δt/year): mint perf shares on excess, update HWM
  - emit `DecisionLogged(epoch, keccak(snapshotJson), keccak(rawProposalJson), targetBps, keccak(rationale))`
  - emit `DecisionData(epoch, snapshotJson, rawProposalJson, rationale)` // full replay payload on-chain
- `tripCheck()` public — anyone can trigger drawdown trip (keeper-style); trip = force-swap all → assets[0], `agentSuspended = true`, emit `DrawdownTripped`.
- `kill()` / `resume()` / `setMandateBounds(...)` — owner only. Kill = permanent agent lockout + withdrawals only.
- `setAgentIdentity(address registry, uint256 agentId)` — ERC-8004 adapter stub (AC: official NFT linkage = stretch).

### VaultFactory
- `createVault(templateId)` — clones (or `new`) MandateVault with preset Mandate; registry array + `VaultCreated` event.
- Templates: 0=Conservative (mUSD 70-100%, mMETH 0-30%, DD 5%), 1=Balanced (mUSD 30-100%, mMETH 0-70%, DD 10%), 2=Aggressive+MNT (3-asset: mUSD 20-100 / mMETH 0-80 / mMNT 0-20, DD 15%) — #2 doubles as the "institutional custom mandate" demo.
- `createCustomVault(Mandate)` — institutional path (L2 demo scene).

### Mocks
- `MockERC20`: mintable-by-anyone faucet mint (testnet only, labeled).
- `MockOracle`: `setPrice(asset, priceUsd1e18)` owner; read by vault + venue. Demo scene 2 crashes mMETH price.
- `MockVenue`: `swap(assetIn, assetOut, amountIn)` at oracle prices, zero slippage (slippage modeling = roadmap).

## clamp-core (TS, the single source of truth shared by agent + verifier + web)

- `ProposalSchema` (zod): `{ regime: 'RISK_ON'|'NEUTRAL'|'RISK_OFF', targetAllocBps: number[], rationale: string }`
- `clamp(targetBps, mandate) → { clampedBps, violations[] }`: per-asset clamp to [min,max], then largest-remainder renormalize to Σ=10000 **within bounds** (deterministic; documented algorithm; if infeasible → safe-asset fallback allocation).
- `canonicalJson(obj)`: sorted-keys stable stringify — MUST byte-match what agent submits on-chain.
- `hashString(s)`: keccak256(utf8 bytes) via viem — matches solidity `keccak256(bytes(s))`.

## Agent (TypeScript)

- Feeds: Binance funding (real REST: last 8h rate + 7d mean), MockOracle prices + vault state via viem.
- Snapshot: `{ ts, chainId, vault, funding: {...}, prices: {...}, vaultState: {allocBps, sharePrice, hwm, tripped} }` → canonicalJson.
- LLM: OpenRouter chat completions, `response_format: json` + schema-in-prompt, temp 0, 3-model fallback chain, 30s timeout, zod parse + 2 retries → on total failure: deterministic fallback proposal (NEUTRAL, hold current allocation) so the agent NEVER stalls (logged as `llmFallback: true` in snapshot).
- Pipeline: snapshot → LLM rawProposal → clamp → `rebalance(clampedBps, snapshotJson, rawProposalJson, rationale)`.
- Modes: `run once` | `sim --steps N --funding-history file` (drives MockOracle per step, populates ≥10 decisions, AC-9) | `loop --interval` (stretch). `--violate` flag skips clamp and submits raw out-of-bounds target → on-chain revert (demo scene 1).

## Verifier (TS CLI)

`verify --vault 0x.. --epoch N [--tamper]`: fetch DecisionLogged+DecisionData → recompute keccak hashes from emitted strings → re-parse rawProposal → re-run clamp → compare clampedBps vs on-chain targetBps → report ✓/✗ table. `--tamper` mutates snapshot before recompute to show ✗ (demo scene 3b).

## Web (Vite + React + wagmi/viem, CF Pages)

Pages: Vaults (factory registry, template cards w/ mandate summary) · Vault detail (mandate card, allocation bar, share price + HWM, decision timeline from events with regime badge/proposal vs clamped/rationale, **Verify button** running clamp-core in-browser) · Deposit flow (connect wallet, faucet mint button, deposit/withdraw). Read-only works without wallet.

## Demo Scenes (scripted, repeatable — scripts/)

1. `scene1-violation.sh` — agent `--violate` → `MandateViolation` revert shown on explorer + console.
2. `scene2-drawdown.sh` — MockOracle crashes mMETH −30% → `tripCheck()` → auto de-risk to mUSD + `DrawdownTripped` + agent suspended (subsequent rebalance reverts).
3. `scene3-verify.sh` — verifier ✓ on real epoch; `--tamper` → ✗.

## Schedule (deadline 6/16 00:59 KST)

| Day | Work | AC |
|---|---|---|
| D1 (6/11 night) | Scaffold ✓, DESIGN ✓, contracts + tests | AC-12 |
| D2 (6/12) | Tests green, deploy Sepolia + mantlescan verify, clamp-core, agent core, first on-chain decisions | AC-1,2,3 |
| D3 (6/13) | Verifier CLI, web, sim run (≥10 decisions), 3 demo scenes, CF Pages | AC-4,7,8,9,10,11 |
| D4 (6/14) | Polish, README, PITCH, video script + recording, GitHub push | AC-5,6,13,14,15 |
| 6/15 | Buffer + DoraHacks submit | ship |

## User-Blocking Items (request just-in-time)

| Item | Needed by | Note |
|---|---|---|
| Burner wallet funded via faucet | D2 deploy | I generate keypair w/ cast; user completes faucet captcha (faucet.sepolia.mantle.xyz or docs faucet) |
| OpenRouter free API key | D2 agent | free signup |
| Etherscan API key (free) | D2 verify | etherscan.io free tier, V2 multichain covers 5003 |
| GitHub repo (public) | D4 push | gh CLI if authed |
| CF Pages project | D3 web deploy | wrangler if authed |
| DoraHacks hacker registration + BUIDL form | 6/15 | manual |
| Mantle TG: ERC-8004 official NFT flow | parallel, non-blocking | stretch linkage |
| Demo video recording | D4 | script provided; screen capture |

## Byreal Alignment (pitch/roadmap, not build scope)

Bybit-first data sourcing is implemented (above). Byreal itself runs on Solana
(Byreal CLMM / Perps Agent Skills / RealClaw), so direct integration belongs to
the Agentic Economy track, not this RWA submission. Pitch treatment:
- `ISwapVenue` is venue-agnostic by design — a Byreal Perps Agent Skills
  execution adapter is the named roadmap item for the hedge/execution leg.
- The agent daemon is packageable as a RealClaw skill (OpenClaw-based) —
  roadmap slide, one line.

## Non-Goals Guardrails (do NOT build)

Mainnet anything · real DEX adapters · 24/7 hosting · L3 marketplace · multi-depositor share edge-cases beyond basics · own ERC-8004 registry · X campaign · token.
