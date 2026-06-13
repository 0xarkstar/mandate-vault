# Security model & audit register

> MandateVault's entire pitch is "trust through verifiable safety," so we hold
> ourselves to it: this document publishes the threat model, the invariants we
> claim and verified, and **every finding from our own pre-submission audit** —
> with its disposition. Reviewed and tested, **NOT** professionally audited.
> Testnet/hackathon scope. Last updated 2026-06-13.

## How this was audited

An 11-dimension review was run across the whole system — RFQVenue, MandateVault,
VaultFactory + mocks, the agent execution / deliberation / learning engines, the
privacy-lite crypto, the verifier, every submission claim vs the code, doc
consistency, test adequacy, and the web dashboard — with each finding
**adversarially re-verified** against source by an independent pass (default-
refute). The methodology and tooling are reproducible; this register is its
output. Some verification passes were rate-limited by the model provider and were
re-confirmed manually against source.

## Threat model & enforcement layers

The design assumes the **LLM is already compromised**. Defense is containment,
not prevention. Any state change passes through 4+ verified layers; the LLM
touches exactly one (the proposal):

1. **Off-chain clamp** (clamp-core) — proposal caged to mandate before any tx.
2. **Reviewer veto** — a *different* model can hold; deterministic arithmetic
   review is the floor (a reviewer outage cannot loosen the cage).
3. **On-chain mandate re-check** — `rebalance()` re-checks every per-asset bound
   and Σ=10000; any violation reverts. A fully hostile harness cannot escape.
4. **Autonomous breach freeze** — `tripCheck()` is permissionless; a drawdown
   breach freezes the agent (FREEZE default: positions held, no forced dump).
5. **Execution path has no LLM** — RFQ compare + fill are pure deterministic
   code (verified: zero LLM imports reachable from `agent/src/execute/`).

## Invariants we claim — and verified hold

Each was confirmed by reading the deployed source (and most are deployed,
mantlescan-verified):

| Invariant | Status |
|---|---|
| `withdraw()` is callable when **tripped** AND when **killed** (no guard) | ✅ confirmed — no `tripped`/`killed` check in `withdraw()` |
| The owner has **no function that moves depositor funds out** | ✅ confirmed — audited every `onlyOwner` fn (kill/resume/setAgent/setMandateBounds/setAgentIdentity); none drains |
| The agent (`mandate.agent`) can **only** call `rebalance()` | ✅ confirmed — no other agent-gated mutator |
| On-chain bounds re-check is **complete** (every asset min/max + Σ=10000) | ✅ confirmed |
| **FREEZE** holds positions (no sells in `_trip`); **DERISK** sells to safe | ✅ confirmed |
| Fee math cannot infinite-mint; perf fee gated above hurdle-adjusted HWM | ✅ confirmed |
| First-deposit inflation defense (floor + dead shares) | ✅ confirmed |
| Reentrancy guard + CEI cover deposit/withdraw/rebalance/tripCheck | ✅ confirmed (MandateVault) |
| RFQ: EIP-712 quotes, per-MM nonce replay protection, **EIP-2 low-s** reject | ✅ confirmed |
| Privacy-lite: on-chain hashes commit to the **published** envelope strings, so public integrity verification is identical and key-holders decrypt to byte-identical canonical strings | ✅ confirmed |
| `feeRecipient` is always the factory owner (every factory vault pays platform) | ✅ confirmed |
| `createVault`/`createCustomVault` are permissionless | ✅ confirmed |

## Findings register

Severity is post-adversarial-verification. **Disposition** states what we did.
The deployed demo contracts are **frozen** (source-verified on mantlescan); on-
chain hardening items are scoped to mainnet so the live demo and its
source-verification stay in sync. Off-chain items were fixed in this pass.

### HIGH

**SEC-1 · `postQuote` is permissionless; the active-quote slot is keyed per-pair (overwrite / front-run griefing).**
`_activeQuote[assetIn][assetOut]` holds exactly one quote per directed pair, and
`postQuote()` has no access control. Any party holding *any* validly-signed
unexpired MM quote for a pair can overwrite the agent's posted best quote before
the vault's `swap()`, or post a tiny-`amountIn` quote that forces the larger vault
leg into the oracle-mid fallback. The headline "agent posts the best quote, the
vault consumes it at that price" is **not enforced on-chain** — last writer before
`swap()` wins. *Bounded by:* prices cannot be forged (signer must equal `q.mm`),
so this is execution **degradation / griefing**, not theft; and on the demo the
agent controls the post→swap sequence. *Disposition:* **disclosed; mainnet fix =
access-control `postQuote` to the vault's agent, or pass the chosen signed quote
through `swap()` calldata (removing the shared mutable slot), or require strict
price-improvement-or-better on overwrite.** A characterization test pins the
current behavior. Not patched on the frozen demo (would require a full re-deploy
+ re-verification of a working, verified deployment at the deadline).

### MEDIUM

**SEC-2 · ERC20 transfer return values unchecked.** `_settle` and the fallback
call `transfer`/`transferFrom` without checking the bool. Harmless against the
bundled `MockERC20` (it reverts on failure), but unsafe for real
false-returning / USDT-style tokens. *Disposition:* mainnet fix = OpenZeppelin
`SafeERC20` + `IERC20` (drop the concrete `MockERC20` casts). Latent on the
demo (mocks revert).

**SEC-3 · Poisoned-quote DoS on the rebalance path.** `postQuote` doesn't escrow
the MM's `assetOut`; the MM can revoke approval between post and `swap()`, making
`_settle` revert and bubbling up to abort the vault op — defeating the "a trip is
never blocked by a missing quote" guarantee (a *poisoned* quote isn't *missing*).
Combined with SEC-1, an attacker can post from an MM they control then yank
approval. *Bounded by:* temporary, expiry-bounded, no fund loss. *Disposition:*
mainnet fix = wrap the `_settle` call in `swap()` in try/catch that degrades to
the oracle-mid fallback on settlement failure (or escrow at post time).

**SEC-4 · Verifier replayed the clamp against *current* mandate bounds.** A
post-epoch `setMandateBounds` could make a genuinely valid past decision replay
to a different allocation and render as `TAMPERED` (false positive), even though
all three hashes pass. *Disposition:* **FIXED off-chain (this pass).** The
verifier now reports **`INDETERMINATE` — integrity verified, clamp differs
(bounds may have changed)** with a distinct exit code when hashes pass but the
clamp diverges, reserving `TAMPERED` for an actual hash break. Mainnet hardening:
read bounds as-of the decision's block (`decision.blockNumber` is already
plumbed).

### LOW (defense-in-depth / mainnet-shaped)

- **SEC-5 · No reentrancy guard on `RFQVenue`.** CEI is followed (delete-before-
  settle; nonce burned before settle), and the bundled mocks have no hooks, so
  not presently reachable. Mainnet fix = add `ReentrancyGuard` once hook-bearing
  tokens are possible.
- **SEC-6 · Oracle consumed without staleness/deviation bounds** in the fallback
  fill and TCA. The `MockOracle` is testnet-only (owner setter); mainnet fix =
  Chainlink/Pyth-style feed with heartbeat + deviation guards (requires the
  `IPriceOracle` interface to expose round data).
- **SEC-7 · `DOMAIN_SEPARATOR` cached at construction** — not chain-fork-
  resistant. Bounded by per-quote expiry + per-MM nonces. Mainnet fix = OZ EIP712
  recompute-on-chainid-change.
- **SEC-8 · `createCustomVault` has no guardrails** (no fee caps / safe-asset
  validation beyond feasibility). Per-vault isolation means a bad creator only
  harms depositors who opt into *that* vault. Mainnet fix = sane caps + a curated
  factory tier.

### INFO / quality (no security impact)

- `_recover` relies on `ecrecover`'s zero-return for out-of-range `v` instead of
  an explicit `require(v==27||v==28)`; EIP-2098 compact sigs unhandled. Not
  exploitable (downstream zero-check + `signer==q.mm`). Trivial cleanup.
- The `--tamper` CLI flag only mutates the snapshot; `doVerify` itself catches a
  tamper of any of the three fields (snapshot/proposal/rationale). Demo-surface
  only.
- Keyless confidential verification attests payload **integrity**, not that the
  on-chain allocation is the correct clamp of the (hidden) proposal — by design,
  and the verdict says `INTEGRITY VERIFIED`, not `VERIFIED`. A viewing key
  upgrades to full content replay.
- Mock contracts (open mint, single-step price set) are clearly testnet-only and
  must not leak into mainnet.

## Mocks & testnet scope (explicit)

`MockERC20` (open faucet mint), `MockOracle` (owner price setter), and the demo
market makers (`demo-mm-tight` / `demo-mm-wide`, ours, labeled) are scaffolding.
Mainnet prerequisites, none of which are claimed as done: professional audit,
multisig/governance owner with timelocked `resume`, decentralized oracle, real MM
integrations, `SafeERC20`, SEC-1/2/3/5/6/7 fixes above, and ERC-4626
virtual-offset share accounting.

## Coordinated disclosure

This is a hackathon testnet artifact with no real funds at risk. For anything
found in the deployed contracts, open a GitHub issue. Mainnet deployment is gated
on a professional audit that supersedes this self-review.
