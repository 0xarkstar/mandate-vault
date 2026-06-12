# MandateVault — Session Handoff

> **Read this first, in full, before touching anything.** This file lets a fresh
> session continue the build with zero loss of intent. Updated: 2026-06-12.
> Deadline: **2026-06-16 00:59 KST** (Mantle Turing Test Hackathon, AI x RWA track).

---

## 0. TL;DR — where we are

- **Foundation is BUILT and GREEN**: contracts (26 tests) + clamp-core (13) +
  agent (44) + verifier (19) + web (38) = 140 tests. Full local-anvil E2E
  rehearsal passed (deploy → deposit → agent decision → 3 demo scenes → verify →
  web). HEAD = `c1296c1`.
- **Three design docs are FROZEN** (authoritative — do not re-litigate):
  `docs/SUBMISSION.md` (product/pitch), `docs/DESIGN.md` (contracts),
  `docs/HARNESS.md` (agent architecture).
- **The product pivoted** through this session to its final form (see §2).
  The built code reflects the OLD framing ("AI-managed vault"); the NEXT build
  cycle re-centers it on the NEW framing ("AI execution & onboarding rail")
  WITHOUT throwing away the foundation.
- **NEXT BUILD = the RFQ execution engine** (the new core pillar), then the
  deliberation proposer/reviewer split, then a thin learning-engine slice.
  All buildable on local anvil — **no user input needed to start.**
- **BLOCKED separately**: live Sepolia deploy needs 3 user-provided items (§6).

---

## 1. What the product IS (final, frozen)

**MandateVault — the smooth on-ramp for institutional/RWA capital onto Mantle:
AI executes, the mandate protects, the chain proves best execution.**

We do NOT manage assets and do NOT claim alpha. We are an **AI-powered execution
& onboarding rail**. The AI decides HOW capital moves (execution, liquidity
sourcing, onboarding translation), never WHETHER to invest. This dodges the
alpha trap (operator's own research proves edge≠logic) and makes the AI's output
objectively measurable (slippage bps, fill quality) — a stronger answer to the
"is the AI output verifiable?" scorecard line than "was the allocation good?".

Analogy: what custody (Fireblocks) did for *holding*, MandateVault does for
*moving and delegating* institutional capital on-chain.

Full detail in `docs/SUBMISSION.md`. Do not re-open the positioning — it took
the whole session to converge and is now FROZEN. Build, don't re-design.

---

## 2. How we got here (the pivot chain — so you don't re-tread it)

The operator pushed through ~10 refinements. Each was an improvement; the final
state already absorbs all of them. Do NOT propose reverting to an earlier one:

1. generic "AI vault" → too obvious, no kick
2. don't claim alpha (operator research: public logic is arbitraged)
3. must help MNT/Mantle value capture → no-token, fee-on-flow model
4. "stability rails" not "management"
5. must be a *reason to use Mantle* (necessity, not deployment target)
6. "circuit breaker on a blockchain" is wrong → renamed to **drawdown trip**,
   default **FREEZE** (suspend agent, hold positions — NO forced dump into a
   crash), optional DERISK only within a slippage bound
7. **RFQ** to kill slippage/MEV → promoted to the CORE execution pillar
8. it's a TOOL/PLATFORM for smooth liquidity + execution + **onboarding**, AX
   directly applied (NOT "LLM-pasting")
9. role = **Vault** (not LP, not DEX, not "advanced Jito"). LP/DEX/MM are
   COUNTERPARTIES we call, not what we are. Closest refs: Hashflow (RFQ) +
   Morpho (curated vault + factory) + AI/verification.
10. harness must apply OMC/Ouroboros/memory philosophies AND keep trades fast →
    **3-engine / two-clock** architecture (see §3, `docs/HARNESS.md`)

Naming note: product can carry a platform name above the "MandateVault" vault
primitive later; not worth renaming the repo/contracts now.

---

## 3. The agent & harness design (frozen — `docs/HARNESS.md` is authoritative)

**One principle: the EXECUTION path never touches an LLM.** Three engines, three
clocks:

| Engine | Clock | Decides | LLM | Modules (target) |
|---|---|---|---|---|
| Learning | minutes–hours, background | how to improve | yes | `agent/src/learn/` |
| Deliberation | ~1/hour (cooldown) | WHAT (intent) | yes | `agent/src/deliberate/` |
| Execution | milliseconds | HOW (fill) | **NO** | `agent/src/execute/` |

**Typed contracts ARE the design** (engines talk only through these):
- `ExecutionIntent` (deliberation→execution): `{vault, targetAllocBps,
  maxSlippageBps, playbookVersion, snapshotHash, reviewVerdict}`
- `PolicyIndex` (learning→deliberation): `{version, regimeHints, updatedAtBlock}`
  — small flat lookup, NOT raw history (the MEMORY.md index pattern = why the
  hot path stays fast).

**Memory-philosophy mapping**: Karpathy append-only = the on-chain decision log;
Kepano rewrite = background distillation; MEMORY.md index = compiled PolicyIndex.

**5 harness invariants (NEVER violate)**:
1. No LLM on the execution path (constitutional — breaks latency AND verifiability).
2. Every decision snapshots its `playbookVersion` (so it replays against the
   policy it actually used).
3. All gates/loops bounded — deliberation resolves in ONE pass to act-or-hold;
   onboarding capped at N rounds then aborts. "Not confident" → no action.
4. Proposer ≠ reviewer (different models; no self-approval — OMC rule; also
   powers Agent Arena).
5. 4+ enforcement layers on any state change: off-chain clamp → reviewer veto →
   on-chain mandate re-check → autonomous breach freeze.

**Two-clock rationale**: deliberation may be slow and may resolve to *no action*
(funds stay safe); what's delayed is the decision, never a fill in flight — every
fill that happens is fast because execution is pure deterministic code reading a
pre-compiled index.

---

## 4. What is already BUILT (do not rebuild — extend)

Monorepo: pnpm workspace + Foundry. Root `/Users/arkstar/Projects/mandate-vault`.

### contracts/ (Foundry, Solidity 0.8.24) — 26 tests green
- `MandateVault.sol` — per-vault mandate struct (asset bounds, maxDrawdownBps,
  cooldown, fees, agent); `deposit`/`withdraw` (mUSD-in, share accounting,
  first-deposit floor + dead shares); `rebalance(targetBps, snapshotJson,
  rawProposalJson, rationale)` agent-only, on-chain bounds re-check, emits
  `DecisionLogged` + `DecisionData`; drawdown `tripCheck()` (currently DERISK =
  sells to safe + suspends — see §5 change #2); mgmt+perf fees; `setAgent`,
  `kill`/`resume`, `setMandateBounds`, `setAgentIdentity` (ERC-8004 stub);
  `nonReentrant` guard.
- `VaultFactory.sol` — `createVault(templateId, agent)` (0=Conservative,
  1=Balanced, 2=Aggressive 3-asset), `createCustomVault(Mandate)` (institutional
  path), registry.
- `MockERC20` (open faucet mint), `MockOracle` (owner setPrice, demo crashes),
  `MockVenue` (oracle-priced swap behind `ISwapVenue`), interfaces
  (`IPriceOracle`, `ISwapVenue`, `IAgentIdentity`).
- `script/Deploy.s.sol` — deploys full stack + 3 template vaults; env
  `PRIVATE_KEY` + `AGENT_ADDRESS`.

### packages/clamp-core/ (pure TS, shared) — 13 tests green
- `clamp(targetBps, bounds)` — deterministic cage: per-asset clamp + sum repair
  (deficit→lowest index/safe-first, excess→highest index). `canonicalJson`
  (sorted-key stable), `hashString` (keccak = solidity `keccak256(bytes(s))`),
  `ProposalSchema`/`SnapshotSchema`/`MandateBoundsSchema` (zod). **Imported by
  agent AND verifier AND web — single source of truth. Do not fork it.**

### packages/abi/ — generated ABI JSON + TS exports
- Regenerate after ANY contract change: `bash packages/abi/gen-abi.sh`
  (runs `forge inspect`; needs forge on PATH).

### agent/ (TS daemon, Node 25, tsx) — 44 tests green
- `feeds/funding.ts` — **Bybit v5 primary** (funding/history + tickers),
  Binance failover. Newest-first normalized to oldest-first. Live-verified.
- `feeds/vault.ts`, `snapshot.ts` (SnapshotSchema, canonicalJson),
  `llm.ts` (OpenRouter, 3-model free fallback chain, zod parse + retry,
  deterministic hold fallback on total failure), `decide.ts` (pipeline +
  trip-aware via DecisionLogged receipt parse + `--violate` path),
  `sim.ts` (accelerated N-step, on-chain cooldown pre-wait, deterministic price
  path), `main.ts` (CLI: `--mode once|sim`, `--violate`, `--force-target`,
  `--vault`), tools (`set-price`, `trip-check`, `create-demo-vault` =
  short-cooldown custom vault for sim).
- `.env` keys: `PRIVATE_KEY` (agent), `RPC_URL`, `CHAIN_ID`, `VAULT_ADDRESS`,
  `OPENROUTER_API_KEY`, `ORACLE_ADDRESS`, `ORACLE_OWNER_KEY`.

### verifier/ (TS CLI) — 19 tests green
- `verify.ts` (pure `doVerify` — clamp-core only, browser-safe, exports
  `tamperString`), `fetch.ts` (chunked getLogs — **public Mantle Sepolia RPC
  rejects >10k-block ranges**, fallback starts 50k and shrinks /5), `cli.ts`
  (`--vault --epoch [--tamper] [--rpc]`), `render.ts`. Box-table verdict ✓/✗.

### web/ (Vite + React 19 + viem + Tailwind v4) — 38 tests green
- Vaults list, vault detail (mandate card, allocation bar, decision timeline
  with raw-vs-clamped + regime badge, **in-browser Verify button** running
  clamp-core), deposit panel (faucet mint + deposit/withdraw), hash routing,
  wallet optional. **Uses parallel readContract, NOT multicall3** (anvil has no
  multicall3). Env: `VITE_FACTORY_ADDRESS`, `VITE_RPC_URL`, `VITE_CHAIN_ID`,
  `VITE_EXPLORER_URL`. Build: `pnpm --filter @mandate-vault/web build`.

---

## 5. NEXT BUILD CYCLE — exact work, in order

All of this runs on LOCAL ANVIL — start immediately, no user input needed.
Re-center the built code on the §1 framing. Keep all 140 existing tests green;
add tests for new code (operator rule: ≥80% coverage, write tests first where
practical).

### Change #1 — EXECUTION ENGINE (RFQ). BUILD FIRST, FULL. Highest priority.
The new core pillar + biggest latency-risk item. Under `agent/src/execute/` +
a new contract.
- **Contract `RFQVenue.sol`** behind the existing `ISwapVenue` interface (drops
  into MandateVault where MockVenue is now — vault body barely changes):
  - `fillSignedQuote(Quote, signature)` — EIP-712 `Quote {assetIn, assetOut,
    amountIn, amountOut, expiry, mm, nonce}`; verify MM signature, check expiry,
    pull/settle atomically. Reject expired/replayed (nonce) quotes.
  - Keep `MockVenue` for fallback/tests; RFQVenue is the headline path.
- **`agent/src/execute/rfq.ts`** — request signed quotes from MM bots (HTTP or
  in-process), collect, zod-validate signatures.
- **`agent/src/execute/route.ts`** — `selectBest(quotes, oracleMid)` (arithmetic,
  best amountOut vs mid, NO LLM) + `slippageGate(best, maxSlippageBps)` → fill or
  FREEZE (never dump).
- **`agent/src/execute/submit.ts`** — atomic `rebalance`/fill; on-chain mandate
  re-check is the final backstop.
- **2 demo MM bots** (`scripts/` or `agent/src/mm/`) — sign quotes at Bybit
  mark ± spread (one tight, one wide) so the vault demonstrably picks the better
  and records the improvement. **Label as ours / demo in README** (honesty).
- **TCA recording** — emit/record fill price vs oracle mid, improvement bps
  (extend snapshot or a `QuoteFilled` event).
- Demo scene 2 becomes: RFQ quotes → best pick → atomic zero-slippage fill.

### Change #2 — drawdown trip: FREEZE default + DERISK-within-bound
- `MandateVault`: add `tripMode` (FREEZE|DERISK) mandate field. FREEZE = suspend
  agent, HOLD positions (no forced dump). DERISK = current behavior but route via
  RFQ within the slippage bound, never market-dump. Update tests.

### Change #3 — DELIBERATION engine split (proposer ≠ reviewer)
Under `agent/src/deliberate/`. Medium priority.
- `propose.ts` (from current `llm.ts`) → `Proposal`.
- `review.ts` — **different model**, adversarial check vs mandate+context →
  `{verdict: approved|hold, reason}`.
- `gate.ts` — deterministic: hold on disagreement/low-confidence; ONE pass,
  bounded, default to HOLD (funds untouched). Emit `ExecutionIntent`.
- `onboard.ts` — **thin**: plain intent → mandate with an ambiguity score
  (Ouroboros-lite). Full multi-round Ouroboros loop = ROADMAP, not now.

### Change #4 — LEARNING engine: THIN demo + roadmap
Under `agent/src/learn/`. Lowest priority — do NOT let it eat RFQ time.
- `distill.ts` — read on-chain DecisionLogged/Data → simple per-regime slippage
  stats. `index.ts` — compile to `PolicyIndex vN`.
- Add `playbookVersion` to the snapshot (SnapshotSchema) — verification invariant.
- Web: a "Playbook vN" card. Full compounding loop = ROADMAP, labeled as such.

### Change #5 — Agent Arena (the kick)
- Agent `--model` flag (pin one model per run). Run identical mandate/data with
  3 models, score on **execution quality** (slippage, quote selection,
  mandate-compliance, breach response) — NOT alpha.
- Web: arena leaderboard page reading on-chain behavior across the 3 vaults.

### Change #6 — Web upgrades (behavior-as-spectacle)
- Cage diagram (AI wanted → allowed, clamp delta highlighted), allocation
  breathing chart, behavior badges (regime shift / cage-hit / fallback / trip),
  onboarding intent→mandate flow, execution timeline w/ fill-vs-mid, runway
  display (mUSD sleeve ÷ burn-rate input), separation-of-powers card.
- Template relabel: Conservative/Balanced/Aggressive → presentation labels
  (e.g. emergency-fund-floor framing for retail).

**Build method**: contracts via Foundry + `forge test`; regenerate ABI after
contract changes; agent/verifier/web via pnpm + vitest. Rehearse the full E2E on
local anvil before claiming done (see §7). Commit at each green milestone with
the operator's conventional-commit + Co-Authored-By footer style.

---

## 6. BLOCKED ON USER (Sepolia deploy track — parallel to §5)

The build in §5 does NOT need these. Live deploy does. Three items:
1. **Sepolia faucet MNT** to burner wallets (keys in gitignored `.env`):
   - deployer `0x23128FBb14aB0d9b6e6Ca41b4a39916b13010528` (in `contracts/.env`
     as `PRIVATE_KEY`)
   - agent `0x9b1f06e60Ca1421e839b122298352a16ad3673b8` (`agent/.env`
     `AGENT_ADDRESS`; its key is `agent/.env` `PRIVATE_KEY`)
   - faucet: https://faucet.sepolia.mantle.xyz
2. **OpenRouter free API key** → `agent/.env` `OPENROUTER_API_KEY`. **Real-LLM
   path is UNTESTED** (all rehearsals used the deterministic fallback). Verify
   this first when the key arrives.
3. **Etherscan API key** (free, V2 multichain covers chainid 5003) →
   `contracts/.env` `ETHERSCAN_API_KEY`. For mantlescan source verification.

Non-blocking, optional: ask Mantle TG/Discord for the **official ERC-8004 agent
registration** flow (organizer-confirmed Mantle issues the NFT; process
undocumented). `setAgentIdentity()` socket already exists — pure bonus.

When unblocked: deploy to Sepolia → mantlescan verify → populate arena/timeline
with the REAL LLM → CF Pages deploy → **measure gas per decision** (README
evidence: "$0.00X on Mantle vs $Y L1-equiv") → README/pitch → 2-min video →
DoraHacks BUIDL submit (buffer 6/15).

---

## 7. Verified facts (2026-06-12) — don't re-discover

| Fact | Value |
|---|---|
| Mantle Sepolia | chainId **5003**, rpc `https://rpc.sepolia.mantle.xyz`, explorer `https://sepolia.mantlescan.xyz` (Etherscan-family, verify via V2 API chainid=5003) |
| RPC quirk | `eth_getLogs` rejects >10k-block ranges → verifier chunks (50k→/5) |
| OpenRouter free | `openai/gpt-oss-120b:free` → `qwen/qwen3-next-80b-a3b-instruct:free` → `meta-llama/llama-3.3-70b-instruct:free` |
| Funding feed | Bybit v5 `/v5/market/funding/history` + `/v5/market/tickers` (primary, keyless); Binance `/fapi/v1/...` failover |
| Assets | mUSD (Mantle native T-bill stable, USDY-family — pitch as "USDY/mUSD"), mETH (Mantle flagship LST), MNT (treasury/gas). Track text names USDY+mETH explicitly. |
| forge | installed at `~/.foundry/bin` (foundryup). `export PATH="$HOME/.foundry/bin:$PATH"` |
| Toolchain | node 25.8, pnpm 10, python3 available |

## 8. Local E2E rehearsal recipe (how to verify a build end-to-end)

This worked this session — reuse it. Anvil needs a DEFAULT chain (NOT
`--chain-id 5003`; that triggered estimateGas failures — root cause unconfirmed,
plain `anvil` works). Generate fresh funded burner keys with `cast wallet new`
and fund from an anvil unlocked account; do NOT rely on the well-known test key
literal (the session tooling auto-redacts it, which corrupted env files).
Sequence: deploy stack → `create-demo-vault` (60s cooldown) → deposit → agent
`--mode once` → scene1 `--violate` (expect MandateViolation revert) → scene2
`--force-target` + oracle crash + tripCheck (expect 100% safe + suspend) →
verifier `--epoch N` (VERIFIED) and `--tamper` (TAMPERED, exit 1) → `vite
preview` + Playwright screenshot the dashboard + click Verify.

## 9. Hard rules (operator standing preferences)

- Immutability (no mutation), small files (<800 lines, ~200-400 typical), zod-
  validate all external input, comprehensive error handling, no hardcoded
  secrets (env vars), no stray console.log in library code, ≥80% test coverage.
- **No token. Fee-on-flow business model.** Never add a token.
- **AI does HOW, never WHETHER.** Never let the agent "pick investments for
  alpha." Never put an LLM on the execution path.
- Honesty in the submission: reviewed+tested NOT audited; demo MMs are ours;
  mainnet prerequisites (audit, multisig owner, decentralized oracle) listed
  separately. This self-honesty is a scoring asset, not a weakness.
- Don't re-open frozen positioning (§1/§2). Build forward.
- Verse8 MCP: this is NOT a Verse8 project — `verse8_bootstrap` returns
  not_verse_project; use normal git, ignore Verse8 rules.

## 10. Scorecard targets (what the build must satisfy)

Common 50% (Technical 15 / Ecosystem 10 / Business 10 / Innovation 10 / UX 5) +
RWA track 50% (AI×RWA depth 15 / Mantle integration 10 / Compliance 10 / Path A|B
10 / Execution & demo 5). Track names USDY+mETH; testnet-functional = "Average
(5-6)", mainnet-live = "Good/Excellent" — so deploy + verify matters. Deployment
Award (rolling $1k×20, first-come) = nice-to-have, operator expects not to get it.
Detail: `docs/SUBMISSION.md` scorecard table + the judging spreadsheet
(gid map in earlier session; RWA gid=1382913087).
