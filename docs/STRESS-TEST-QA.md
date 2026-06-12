# Stress-test Q&A — the hard questions, asked by ourselves first

> Product positioning was beaten against every objection the operator could
> raise (2026-06-13, pre-submission). Each entry: the objection, verbatim in
> spirit → the resolution. This file is the canonical defense register; the
> pitch (docs/PITCH.md) is derived from it. If a judge asks one of these,
> the answer is here.

## Identity

**"Isn't this just a fund + an AI fund manager?"**
Structurally it resembles one (deposits, allocation, fees) — we don't fight
the word. The claim differs: a fund sells discretion + promised returns; this
sells a rail — chain-enforced limits, MEV-free execution, provable behavior.
WHETHER to invest stays with the depositor (their mandate); the AI only ever
decides HOW. We never promise returns. Fees are rail fees, not alpha fees.

**"Institutions don't trust AI with money — your premise is wrong."**
Agreed — and that distrust IS the premise. The product is built for people
who do NOT trust AI: the AI is replaceable (`--model`, `setAgent`),
gracefully degradable (deterministic fallback — happened live on Sepolia,
recorded honestly on-chain), and caged (worst case of a fully jailbroken
model = suboptimal allocation inside your bounds). We bet on AI being
*doubted*, not on AI being good.

**"Why is the AI there at all, then?"**
(a) This track's thesis is verifiable on-chain AI — Arena is that thesis as
a product. (b) LLMs genuinely add: natural language → mandate translation,
decision rationale for audit. (c) The trajectory bet: automated execution is
becoming AI-shaped regardless of anyone's comfort; the safety/proof rail for
it does not exist yet. Remove the LLM and a rules-bot in the same cage still
works — the rail is the product, the AI is the demo tenant.

**"Just an in-house LP + in-house aggregator?"**
The deletion test: swap our RFQ venue for any other execution venue — the
product survives intact (execution is replaceable plumbing; we built our own
because testnet had nothing to plug into). Delete the mandate cage, replay
verification, or Arena — nothing remains. Also the directions are reversed:
an LP *sells* liquidity (becomes everyone's counterparty); this vault *buys*
execution (MMs are its counterparties). An aggregator routes anyone's swaps;
this routes only its own mandate-bound rebalances.

**"A rebalancing vault is still just a v2 LP."**
Mathematically opposite. A v2 LP's composition is a **function of price**
(x·y=k keeps buying the falling asset — that is IL), it is rebalanced *by*
the market, passively, always on the adverse side, and anyone can trade
against it. This vault's composition is a **function of decision** (bounded
by mandate), it rebalances *in* the market as a taker, and nobody can trade
against its balances — they're just a wallet. One is a standing target that
collects fees for being picked off; the other is a customer that pays a
small spread to never be picked off.

## Mechanics

**"What do MMs provide, and where? Signing every trade is absurd."**
No pool, no lockup. MMs keep inventory in their own wallets, approve the
venue once, and run automated quoting engines that sign EIP-712 quotes in
milliseconds — the same model as decades of FX dealing and every modern RFQ
system (Hashflow, 0x RFQ, CEX MM APIs). The signature *is* the product: a
firm, non-repudiable price. Settlement is per-fill transferFrom, atomic.
vs AMM LPing: no impermanent loss, per-trade pricing, capital efficiency.

**"Why would the vault pay MMs spread instead of earning it?"**
Earning spread means *being* the market maker — inventory risk + informed
flow. The operator's own 6-month market-making research (zo-mm-sim) proved
that seat bleeds without latency infrastructure (LVR = σ²/8; maker book ≈
breakeven at best). The vault's growth comes from asset yields (T-bill,
staking); execution is a toll to minimize, not a business to enter.
$1M rebalance: AMM path ≈ $13k+ (impact + sandwich + fee, known after);
RFQ path ≈ $500 (spread, known before, gated). Measured live: +4bps vs mid.

**"Why would MMs come at all? / Who uses this swap route?"**
Today: nobody, correctly — there is no flow yet, and the route is internal
plumbing, not a retail product. MMs are mercenary: they arrive wherever
benign flow exists, automatically (PFOF exists because uninformed flow is
the best flow in finance). The bootstrap variable is capital, not MMs.

**"Does this fix chain liquidity / MEV?"**
No, and we don't claim it. Protection applies to flow routed through this
rail. The ecosystem effect is the *quality of capital admitted*: rule-bound,
panic-proof (FREEZE ≠ dump), non-toxic. Sequenced honestly: v1 imports
capital (deposits = Mantle TVL; recurring benign flow = MM bait), v3
converts it into liquidity supply (mandate prime brokerage — caged capital
leased as MM inventory, with limits and receipts).

**"Aggregator listing?"**
The permissionless door exists (`fillSignedQuote`), deliberately unlisted:
aggregator flow carries arb bots (toxic) and would dilute the benign-flow
pitch to MMs. Gated behind v2 toxicity-aware pricing — per-flow markout
scores from on-chain TCA, so MMs can tier quotes. The venue prices poison
instead of drinking it.

**"Can the AI learn to beat toxic flow eventually?"**
No — the operator's research already killed this (meta-labeling verdict:
selection is not the lever; cost+latency is; informed flow wins on
information, not patterns). Learning's honest ceiling is classification and
defense — identify toxicity, price it, refuse it. That ceiling is exactly
what v2 builds.

**"Why not run arbitrage ourselves later?"**
Permanently out, three independent reasons: (1) the operator's research
verdict — arb is a latency/infra game we don't claim to own; (2) it would
re-introduce the alpha claim and collapse the positioning; (3) fatal
conflict of interest — a venue operator prop-trading against its own flow is
the dark-pool scandal pattern, and MMs would leave the moment the data layer
could trade against them. We don't hunt; we sell the hunting ground and the
maps (toxicity data, caged capital leasing, Arena selection).

## Money

**"Where does the platform earn? Is revenue capped?"**
Live in code today: every factory vault (template or custom) pays the
platform 1%/yr management (share dilution per rebalance) + 10% performance
above a 4.5%/yr T-bill hurdle (HWM). Linear in TVL — the most proven model
in asset management (BlackRock, Lido), uncapped structurally; the ceiling is
GTM, not architecture. Roadmap revenue (labeled not-in-code): per-fill venue
fee, toxicity-data subscriptions, prime-brokerage fees.

**"Token?"**
No token TODAY — a deliberate credibility choice (value lands in
Mantle-native assets; no mercenary-emissions flywheel). Amended stance
(2026-06-13): a token is not forbidden forever. Issuance becomes permissible
ONLY when all three hold: (a) the rail has organic fee-generating flow — a
token must capture value that already exists at a bottleneck (operator's
value-capture research), never bootstrap value that doesn't; (b) a complete
roadmap/milestone structure defines exactly what the token captures (fee
switch, venue-operator staking, governance) and why a token beats equity-like
fee accrual for that purpose; (c) issuance cannot compromise the
no-alpha / no-prop-trading constitution. Token-as-TVL-rental (emissions)
remains permanently out.

**"Assets could just go down forever — why deposit?"**
Two floors make "forever down" structurally impossible: (1) the drawdown
trip — your pre-chosen maximum loss, enforced by code, anyone can trigger,
the AI cannot override; (2) the safety sleeve earns ~4-5% T-bill yield
(asset[0] is structurally the safe asset; deposits, withdrawals, de-risking
and fallback all anchor to it — "T-bill floor, caged carry"). The customer
already decided to hold these assets; the vault is a better way to hold
them than self-custody (emotion, ops risk) or a manager (trust, rug,
style drift) — see the comparison table in PITCH.md.

**"What if the owner abandons a tripped vault? One owner controls fate?"**
Depositor withdrawals are NEVER blocked — not when tripped, not when killed
(code invariant, not policy). An orphaned vault dies; the money walks out.
The owner cannot withdraw depositors' funds (no such function) and the
normal model is owner = the capital's own governance. Pooled-vault owner
centralization → multisig/governance owner + timelocked resume (mainnet
register).

## The one real weakness (stated, not hidden)

Demand thesis: *will institutions/DAOs actually delegate capital to AI
agents under mandates?* — unproven. Every other objection above resolves
mechanically IF capital comes. This is the single bet the product makes,
and the hackathon demonstrates the bet end-to-end rather than proving it.
