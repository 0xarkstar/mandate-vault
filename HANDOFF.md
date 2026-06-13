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
- **276 tests green**: contracts 51 (forge) + agent 94 + web 83 + verifier 24 +
  clamp-core 24. tsc clean in every package; vite build clean.
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

### contracts/ (Foundry, Solidity 0.8.24) — 51 tests
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

### agent/ — 94 tests
- `deliberate/` — `propose.ts` (proposer home; OpenRouter plumbing shared in
  `llm.ts`), `review.ts` (**different model** adversarial verdict
  `{verdict: approved|hold, reason}`; deterministic arithmetic verdict as last
  resort — reviewer outage can loosen nothing), `gate.ts` (ONE pass, default
  HOLD, emits `ExecutionIntent`), `onboard.ts` (thin Ouroboros-lite: intent →
  mandate draft + ambiguity score + questions; multi-round loop = roadmap),
  `types.ts`.
- `execute/` (**NO LLM**) — `legs.ts` (replicates `_executeAllocation` integer
  math: pass-1 sells exact, pass-2 buy-cap uses a mid-fill projection (fills
  are ≥mid or the gate freezes, so the cap is never tighter on-chain),
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

### web/ — 83 tests, builds clean
- **`#/arena`** leaderboard (execution-quality score = 50·fill-improvement +
  30·cage-discipline + 20·autonomy; `lib/arena-score.ts`; model attribution
  labeled roadmap), Header nav.
- Vault detail: TCA fills per decision (QuoteFilled joined by tx,
  `chain/fills.ts` + `lib/fills-tca.ts`), cage diagram (raw vs clamped vs
  bounds), behavior badges (regime shift / cage-hit / fallback / Playbook vN),
  tripMode row in mandate card, Playbook card, separation-of-powers card,
  runway card (safe sleeve ÷ burn input), template sublabels.

### verifier/ + clamp-core — (24 + 24 tests);
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
| **Confidential demo vault** (privacy-lite, 2026-06-13) | `0x0AEfA5D20544499680aa2E4662EE9f171E0B747a` |

Confidential vault: epoch 1 = encrypted-envelope decision (AES-256-GCM,
RFQ legs filled +4bps TCA). Demo viewing key (public BY DESIGN, in README):
`4d616e646174655661756c7420436f6e666964656e7469616c2044656d6f4b31`.
Verifier `--viewing-key` → 🔒 VERIFIED; without → 🔒 INTEGRITY VERIFIED.
Privacy-lite shipped 2026-06-13: clamp-core `confidential.ts` (WebCrypto
AES-GCM envelopes), agent `VIEWING_KEY` env, verifier/web selective
disclosure. Tests now **276** (clamp-core 24 · verifier 24 · web 83 ·
agent 94 · forge 51). Arena round 2 ran: template vaults at 2 epochs each
(gpt-oss 85/15, gemma 80/20/0 real proposals; nemotron 429→honest fallback
twice). Repo public: https://github.com/0xarkstar/mandate-vault. Pitch
blocks: docs/PITCH.md. Video script: docs/VIDEO-SCRIPT.md.

MM burners (1 MNT each, keys in `agent/.env`): tight
`0x71AbD3419831185bb722de9e758303982F2b0a0a`, wide
`0xD6fCB620A3A780695007CA0684f802b78a6d3144`. `agent/.env` fully configured
for Sepolia (placeholder `OPENROUTER_API_KEY` → deterministic fallback until
the real key arrives). `web/.env.production` carries the VITE_ values.
**Sepolia status (2026-06-12): THE FULL STORY IS LIVE ON-CHAIN.**
- scene 1: `MandateViolation` revert proven (cage holds on the public chain)
- epoch 1 (hold) + epoch 2 (hold, **playbookVersion=1** stamped — PolicyIndex
  v1 was compiled FROM the live chain between them)
- **epoch 3 = the headline RFQ decision** (tx `0xa282a507…43b74e3`): both
  legs filled by demo-mm-tight at **+4bps vs oracle mid**, QuoteFilled TCA
  on-chain
- crash → keeper `tripCheck()` → **tripped=true with the mMETH sleeve HELD
  (3.94e18 intact) = FREEZE demonstrated live**, agent suspended
- verifier replayed epochs 2 AND 3 on Sepolia: **VERIFIED ✓**; 1-char tamper
  → **TAMPERED ✗**
- **Measured gas**: hold decision ~163k gas (fee 0.021 MNT); RFQ decision
  with 2 atomic fills **272,949 gas, fee 0.085 MNT** on testnet 50 gwei —
  L1 data fee for the on-chain JSON payload dominates (~84%). Pitch framing:
  a fully-logged, replay-verifiable AI decision costs cents on Mantle.

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

ALL FOUR USER ITEMS LANDED 2026-06-13 — executed same-session:
1. ~~Sepolia faucet MNT~~ DONE (deploy consumed ~1 of 10 MNT each).
2. ~~OpenRouter key~~ DONE + **real-LLM path VERIFIED on Sepolia**: proposer
   models live-smoked; MODELS chain updated to currently-healthy truly-free
   ($0) models: `openai/gpt-oss-120b:free` →
   `nvidia/nemotron-3-super-120b-a12b:free` → `google/gemma-4-31b-it:free`.
   **Agent Arena ran with pinned models** (template vaults, $5k each):
   - Conservative + gpt-oss-120b → real proposal RISK_OFF [8000,2000],
     RFQ fill +4bps TCA (fallback=false) ✓
   - Balanced + nemotron-3-ultra → upstream 429 at that moment → honest
     deterministic fallback hold (fallback=true recorded in snapshot)
   - Aggressive + gemma-4-31b → real proposal RISK_OFF [8000,2000,0],
     RFQ fill +4bps TCA (fallback=false) ✓
3. ~~Etherscan key~~ DONE — **all 10 contracts mantlescan-VERIFIED** (forge
   script --broadcast --resume --verify --private-key needed; demo vault
   matched via identical bytecode).
4. ~~CF Pages~~ DEPLOYED: **https://mandate-vault.pages.dev** (project
   `mandate-vault`, wrangler authed 0930bbc). The first deploy rate-limited
   real viewers; root causes found + fixed (commit `d71c958`):
   - ~40 eth_calls/page → **multicall3 aggregation** (canonical address,
     live on Mantle Sepolia; `scripts/multicall3-runtime.hex` is injected
     into anvil by e2e-anvil.sh via anvil_setCode)
   - log scans from genesis → 4,400+ chunked getLogs → **VITE_START_BLOCK**
     (deploy block 39860090) bounds every scan
   - arena re-scanned the shared venue per vault → **per-venue fills cache**
   Verified worst-case: arena loads real data in ~20s from a fully
   rate-limit-burned IP. ⚠️ Hash routing gotcha: hash-only navigation never
   reloads the page — an old bundle keeps running until a hard reload.

STILL OPTIONAL: free keyed RPC (Tenderly/Alchemy) for heavy demo-video use;
Mantle TG/Discord ERC-8004 registration.

REMAINING ROADMAP: README/pitch finalize (gas + arena numbers are in §6a) →
2-min video → DoraHacks BUIDL submit (buffer 6/15, deadline 6/16 00:59 KST).

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

## 9. Hard rules (operator standing preferences)

Immutability; small files; zod-validate external input; no hardcoded secrets;
≥80% coverage intent; **AI does HOW never WHETHER**; no LLM on the execution
path; **the venue never prop-trades its own flow** (constitutional — conflict
of interest kills the data moat); honesty in submission (reviewed+tested NOT
audited; demo MMs are ours — README says so); don't re-open frozen
positioning; this is NOT a Verse8 project.

**Token rule (AMENDED 2026-06-13 by operator):** no token today =
credibility asset; emissions-to-rent-TVL = permanently out. A token MAY be
issued later, but ONLY when all three hold: (a) organic fee-generating flow
exists (a token captures value at a bottleneck per the operator's
value-capture research — never bootstraps value that doesn't exist);
(b) a complete roadmap/milestone structure defines exactly what it captures
and why a token beats plain fee accrual for that job; (c) it cannot
compromise the no-alpha / no-prop-trading constitution.

**Defense register:** every hard objection raised in the pre-submission
stress-test (fund? v2 LP? why MMs? revenue ceiling? owner abandonment?
chain stability? aggregators? direct arb?) is answered canonically in
**docs/STRESS-TEST-QA.md** — read it before re-litigating any of them.

## 10. Scorecard targets — unchanged

Common 50% + RWA track 50%; track names USDY+mETH; testnet-functional =
"Average", mainnet/live+verified = better — so the §6 unblock matters.
Detail: `docs/SUBMISSION.md` scorecard table (RWA gid=1382913087).
