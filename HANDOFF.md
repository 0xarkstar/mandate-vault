# MandateVault — Session Handoff

> **Read this first, in full, before touching anything.** This file lets a fresh
> session continue with zero loss of intent. Updated: 2026-06-12 (build cycle 2
> COMPLETE). Deadline: **2026-06-16 00:59 KST** (Mantle Turing Test Hackathon,
> AI x RWA track).

---

## 0. TL;DR — where we are

- **THE §5 BUILD CYCLE IS DONE.** All six changes (#1 RFQ engine, #2 FREEZE
  trip, #3 deliberation split, #4 learning slice, #5 Agent Arena, #6 web
  upgrades) are built, tested, rehearsed E2E on local anvil, and committed.
- **230 tests green**: contracts 41 (forge) + agent 84 + web 73 + verifier 19 +
  clamp-core 13. tsc clean in every package; vite build clean.
- **Full E2E rehearsal is now ONE COMMAND**: `bash scripts/e2e-anvil.sh`
  (fresh burner keys per run, no user input, ~4 min). Verified twice this
  session; second run includes the scene-order fix (violation demo surfaces
  `MandateViolation`, not `CooldownActive`).
- **Three design docs remain FROZEN**: `docs/SUBMISSION.md`, `docs/DESIGN.md`,
  `docs/HARNESS.md`. `README.md` now exists (positioning + honesty notes +
  quickstart) — derived from SUBMISSION.md, keep them consistent.
- **REMAINING WORK = the Sepolia/live track only** (§6) — blocked on 3
  user-provided items. Everything buildable without the user is built.

## 1. What the product IS (final, frozen)

**MandateVault — the smooth on-ramp for institutional/RWA capital onto Mantle:
AI executes, the mandate protects, the chain proves best execution.**

We do NOT manage assets and do NOT claim alpha. AI decides HOW capital moves
(execution, liquidity sourcing, onboarding translation), never WHETHER to
invest. Full detail in `docs/SUBMISSION.md`. Do not re-open the positioning.

## 2. Pivot history

See git history of this file (commit `1341eae`) for the 10-step pivot chain.
Final state absorbs all of them; never propose reverting to an earlier one.

## 3. Agent & harness design (frozen — `docs/HARNESS.md` authoritative)

Three engines / three clocks; **no LLM on the execution path**; typed
contracts (`ExecutionIntent`, `PolicyIndex`); 5 invariants (snapshot
playbookVersion; bounded one-pass deliberation; proposer ≠ reviewer; 4+
enforcement layers). ALL OF THIS IS NOW IMPLEMENTED — see §4.

## 4. What is BUILT (everything below is tested + committed)

### contracts/ (Foundry, Solidity 0.8.24) — 41 tests
- `MandateVault.sol` — as before, PLUS `Mandate.tripMode` (enum
  `TripMode {FREEZE, DERISK}`; FREEZE = suspend agent + HOLD positions,
  DERISK = sell sleeves to safe via venue). Templates default FREEZE.
- **`RFQVenue.sol` (the core pillar)** — EIP-712 `Quote {assetIn, assetOut,
  amountIn, amountOut, expiry, mm, nonce}`; `postQuote(q, sig)` (verify MM
  signature, expiry, per-MM nonce replay protection, EIP-2 low-s) stores the
  best quote per directed pair; the vault's `swap()` consumes it pro-rata and
  settles vault↔MM atomically; `fillSignedQuote` = direct taker path. Every
  fill emits **`QuoteFilled(mm, assetIn, assetOut, amountIn, amountOut,
  oracleMidOut, improvementBps)`** = on-chain TCA. No valid quote → oracle-mid
  fallback from venue reserves (trips/withdraw covers never strand).
- `VaultFactory.sol` — templates carry `tripMode: FREEZE`.
- `Deploy.s.sol` deploys **RFQVenue as the factory venue** (MockVenue kept for
  tests only). After ANY contract change: `bash packages/abi/gen-abi.sh`
  (RFQVenue included; `rfqVenueAbi` exported from packages/abi).

### agent/ — 84 tests
- `deliberate/` — `propose.ts` (proposer home; OpenRouter plumbing shared in
  `llm.ts`), `review.ts` (**different model** adversarial verdict
  `{verdict: approved|hold, reason}`; deterministic arithmetic verdict as last
  resort — reviewer outage can loosen nothing), `gate.ts` (ONE pass, default
  HOLD, emits `ExecutionIntent`), `onboard.ts` (thin Ouroboros-lite: intent →
  mandate draft + ambiguity score + questions; multi-round loop = roadmap),
  `types.ts`.
- `execute/` (**NO LLM**) — `legs.ts` (replicates `_executeAllocation` integer
  math exactly on on-chain balances/prices/totalValue → exact swap legs),
  `rfq.ts` (`MmClient` interface, collectQuotes with zod + off-chain EIP-712
  signature verification), `route.ts` (`selectBest` cross-multiplied rate
  compare + `slippageGate` → fill or FREEZE, never dump), `submit.ts`
  (planRfqExecution → postPickedQuotes → parseFills TCA), `types.ts`.
- `mm/demo-mm.ts` — 2 labeled DEMO MMs: tight (+5bps vs mid) / wide (−40bps).
- `learn/` — `distill.ts` (DecisionLogged/Data + QuoteFilled joined by tx →
  per-regime stats), `index.ts` (compile `PolicyIndex vN`); `tools/learn.ts`
  writes `agent/data/policy-index.json`; `main.ts` stamps its version into
  every snapshot (`SnapshotSchema.playbookVersion`, optional — old epochs
  still verify).
- CLI: `--mode once|sim`, `--violate`, `--force-target`, `--vault`,
  **`--model` (arena pin)**. New env (see `.env.example`):
  `RFQ_VENUE_ADDRESS`, `MM_KEY_TIGHT`, `MM_KEY_WIDE`,
  `RFQ_MAX_SLIPPAGE_BPS` (50), `POLICY_INDEX_PATH`.
- Tools: `setup-mms.ts` (MM inventory + approvals),
  `create-demo-vault.ts --trip-mode freeze|derisk` (default freeze).
- decideOnce pipeline: propose → **review → gate (hold ends cycle, funds
  untouched)** → clamp → **RFQ plan/gate/post** → rebalance → parse TCA fills.
  `--force-target` bypasses review (demo scaffolding) but never clamp/chain.

### web/ — 73 tests, builds clean
- **`#/arena`** leaderboard (execution-quality score = 50·fill-improvement +
  30·cage-discipline + 20·autonomy; `lib/arena-score.ts`; model attribution
  labeled roadmap), Header nav.
- Vault detail: TCA fills per decision (QuoteFilled joined by tx,
  `chain/fills.ts` + `lib/fills-tca.ts`), cage diagram (raw vs clamped vs
  bounds), behavior badges (regime shift / cage-hit / fallback / Playbook vN),
  tripMode row in mandate card, Playbook card, separation-of-powers card,
  runway card (safe sleeve ÷ burn input), template sublabels.

### verifier/ + clamp-core — unchanged behavior (19 + 13 tests);
  `SnapshotSchema` gained optional `playbookVersion`.

### scripts/
- **`e2e-anvil.sh`** — the whole rehearsal, one command, self-contained
  (starts anvil unless one is up; `KEEP_ANVIL=1` keeps the populated chain
  for web preview/screenshots). Scene order matters: scene 1 (violation) runs
  BEFORE the first decision because rebalance checks cooldown before bounds.
- Scenes renumbered: `scene1-violation` → `scene2-rfq` → `scene3-drawdown`
  (FREEZE narrative) → `scene4-verify`. Scenes only source `agent/.env` when
  `VAULT_ADDRESS` is not already exported (orchestrator injection wins).

### Verified E2E results (2026-06-12, local anvil)
- Scene 1: `MandateViolation: asset[0] target=0bps outside [2000,10000]` ✓
- Scene 2: both legs filled by demo-mm-tight at **+4bps vs mid** (TCA
  on-chain; +5bps quote → +4 after integer floor) ✓
- Learning: PolicyIndex v1 from 2 decisions; decision 3 stamps
  playbookVersion ✓
- Scene 3 FREEZE: `tripped=true`, allocation still ~[4054,5270,675], mMETH
  balance intact — positions HELD, agent suspended ✓
- Scene 4: epoch 2 VERIFIED ✓ / 1-char tamper → TAMPERED ✗ exit 1 ✓
- Web vite build ✓

## 5. Remaining buildable work (OPTIONAL polish — nothing blocks submission)

1. ~~Web visual QA~~ DONE this session via Playwright against a populated
   anvil: vaults grid (tripped FREEZE vault shows held positions), vault
   detail (tripMode row, Playbook v1 card, separation-of-powers, runway, TCA
   +4bps badges, cage diagram, Verify buttons), arena (active vault ranks
   above no-data vaults; venue-wide fills correctly scoped per vault — bug
   found+fixed+tested in `lib/arena-vault.ts`).
2. Cosmetic: agent console log prints "−4bps vs mid" (slippage sign) where
   the TCA event says +4bps improvement — same number, two conventions;
   display only.
3. Arena gains real spread once the 3 template vaults get their own agents/
   models on Sepolia (the local demo chain has one active vault).
4. `agent/data/` is gitignored (runtime PolicyIndex artifact — never commit).

## 6a. DEPLOYED — Mantle Sepolia (2026-06-12, live)

| Contract | Address |
|---|---|
| mUSD | `0x4cDdc6d4673094E665a86286066cfC7B7652D9bF` |
| mMETH | `0xF23843E345415524A82fA80B5904ccEbeC495DE0` |
| mMNT | `0x4bF74dba5e870e104AdB504293F9CFF44d9BD669` |
| MockOracle | `0x40C8f4D0A5f903eEF9167fa293453edBEdb40747` |
| **RFQVenue** | `0x6555A9429DCa1E0967744e0F55B2891E56f2D7d1` |
| **VaultFactory** | `0xF6b02eaF2f3a08bEf0db2E2293C0B07eFf4BDB0f` |
| Conservative | `0x511716CEf7dC3ea22228bD74fee6683ecBEc1ACb` |
| Balanced | `0x52244F53E303891c948Fab0AF5495CdD70566008` |
| Aggressive | `0x9037cE82381B8abE673B9A3EA9517b195506B54B` |
| Demo vault (60s, FREEZE) | `0xBd5A3F03ed0488262b4bE31d9854CaF3c442de14` |

MM burners (1 MNT each, keys in `agent/.env`): tight
`0x71AbD3419831185bb722de9e758303982F2b0a0a`, wide
`0xD6fCB620A3A780695007CA0684f802b78a6d3144`. `agent/.env` fully configured
for Sepolia (placeholder `OPENROUTER_API_KEY` → deterministic fallback until
the real key arrives). `web/.env.production` carries the VITE_ values.
**Sepolia progress (2026-06-12):** demo vault live with $10k deposited;
scene 1 `MandateViolation` revert proven on-chain; **epoch 1 + epoch 2
decisions logged (epoch 2 carries playbookVersion=1)**; PolicyIndex v1
compiled FROM the live chain; **verifier replayed epoch 2 on Sepolia:
VERIFIED ✓ and TAMPERED ✗** — the headline trust loop works on the public
chain. **Measured gas per decision: ~163k L2 gas; total fee 0.021–0.112 MNT
on testnet (50 gwei), dominated by the L1 data fee for the on-chain JSON
payload** — mainnet pitch framing: ~163k gas/decision, cents on Mantle.

⚠️ RPC reality (hard-won, READ THIS before touching Sepolia): every free
endpoint fails differently —
- official `rpc.sepolia.mantle.xyz`: per-IP sliding-window rate limit; a
  13-call vault read trips it and the penalty persists for minutes. Single
  `cast send`s usually pass.
- `mantle-sepolia.drpc.org`: 500s on JSON-RPC batches above a few calls.
- `mantle-sepolia.gateway.tenderly.co`: truncates big batches ("Cannot read
  properties of undefined"), caps something on busy minutes ("Request
  exceeds defined limit"); writes must NOT be batched.
- blastapi 403s, omniatech 521s, publicnode/sepolia.mantle.xyz dead.
Fixes shipped: agent/verifier transports batch (batchSize 5, wait 50ms) with
6 retries × 15s; wallet (write) transport un-batched. agent/.env currently
points at tenderly. **The real fix is a free KEYED RPC (Tenderly/Alchemy
account) — added to the user list.** Two consecutive `cast send`s from one
key can race the sequencer nonce ("nonce too low") — retry.

## 6. BLOCKED ON USER (Sepolia/live track)

1. ~~Sepolia faucet MNT~~ DONE 2026-06-12 (10 MNT each; deploy consumed ~1).
2. **OpenRouter free API key** → `agent/.env OPENROUTER_API_KEY`. Real-LLM
   path (proposer AND the new reviewer) is still UNTESTED — verify FIRST.
3. **Etherscan API key** (V2, chainid 5003) → `contracts/.env
   ETHERSCAN_API_KEY` for mantlescan verification.
4. **CF Pages deploy needs explicit user go-ahead** (publishing = public
   surface). Build is ready (`web/dist` with Sepolia env baked):
   `cd web && npx wrangler pages project create mandate-vault
   --production-branch=main && npx wrangler pages deploy dist
   --project-name=mandate-vault --branch=main` (wrangler already authed as
   0930bbc@gmail.com).
5. **Free keyed RPC endpoint** (Tenderly or Alchemy account, Mantle Sepolia)
   → `agent/.env RPC_URL` + rebuild web with it in `VITE_RPC_URL`. Kills the
   public-gateway rate-limit lottery for the demo video recording.

When unblocked: mantlescan verify (forge verify-contract, V2 chainid 5003) →
re-run timeline/arena with the real LLM (pin different `--model` per template
vault for the arena story) → README/pitch finalize → 2-min video → DoraHacks
submit (buffer 6/15). Optional: Mantle TG/Discord for ERC-8004 registration.

## 7. Verified facts — don't re-discover

(unchanged from previous handoff: Mantle Sepolia chainId 5003 /
rpc.sepolia.mantle.xyz / mantlescan V2; eth_getLogs >10k-block chunking;
OpenRouter free model chain; Bybit v5 primary funding feed; forge at
~/.foundry/bin; node 25.8 / pnpm 10.)
Plus new this session:
- anvil default chain: `cast rpc anvil_setBalance` funds burners without any
  well-known key literal (the tooling auto-redacts those — never write them).
- `pnpm --filter X exec tsx` runs with the package as cwd (relative paths like
  `data/policy-index.json` resolve inside `agent/`).
- rebalance() checks cooldown BEFORE bounds → violation demos need a
  cooldown-free vault state.
- agent/main.ts and tools guard CLI execution behind an ESM main-module check
  (importing them from vitest is safe).

## 8. E2E rehearsal recipe

`bash scripts/e2e-anvil.sh` — that's it. `KEEP_ANVIL=1` to keep the chain for
the web preview. For manual scene-by-scene runs, populate `agent/.env` and use
`scripts/scene{1..4}-*.sh` (they self-load `.env` only when VAULT_ADDRESS is
not exported).

## 9. Hard rules (operator standing preferences) — unchanged

Immutability; small files; zod-validate external input; no hardcoded secrets;
≥80% coverage intent; **no token, fee-on-flow**; **AI does HOW never
WHETHER**; no LLM on the execution path; honesty in submission (reviewed+
tested NOT audited; demo MMs are ours — README says so); don't re-open frozen
positioning; this is NOT a Verse8 project.

## 10. Scorecard targets — unchanged

Common 50% + RWA track 50%; track names USDY+mETH; testnet-functional =
"Average", mainnet/live+verified = better — so the §6 unblock matters.
Detail: `docs/SUBMISSION.md` scorecard table (RWA gid=1382913087).
