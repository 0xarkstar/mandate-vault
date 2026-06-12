# Demo video — 2:00 script + shot list

> Target ≤ 2:10. English narration (international judges). Record at
> 1920×1080, terminal font ≥ 18pt, browser at 110% zoom, dark theme
> everywhere. Cursor highlighting ON.

## Prep (do once, before recording)

```bash
# 1. Local anvil with full story for the TERMINAL takes (deterministic,
#    no public-RPC lottery during recording):
KEEP_ANVIL=1 bash scripts/e2e-anvil.sh        # ~4 min, leaves chain running

# 2. Browser tabs, in order:
#    A: https://mandate-vault.pages.dev/#/vaults        (live Sepolia)
#    B: https://mandate-vault.pages.dev/#/vault/0xBd5A3F03ed0488262b4bE31d9854CaF3c442de14
#    C: https://mandate-vault.pages.dev/#/arena
#    D: https://sepolia.mantlescan.xyz/address/0x6555A9429DCa1E0967744e0F55B2891E56f2D7d1
# 3. Terminal: cd to repo, clear scrollback. Pre-type commands in a notes app.
```

Honesty note for narration: terminal scenes run on the local rehearsal chain
(same code, deterministic for filming); everything shown in the browser is
LIVE Mantle Sepolia. Say it once at 0:35 ("here's the same thing live").

---

### 0:00–0:12 — Hook  ·  [Tab A: vaults page]

> "Nobody sane gives an AI a private key. But AI-run capital is coming
> anyway. MandateVault is the rail that makes it safe — live on Mantle."

Action: slow scroll over the four vaults; hover the Tripped badge last.

### 0:12–0:35 — The cage  ·  [Tab B: vault detail → terminal]

> "Every vault has a mandate the contract itself enforces: allowed assets,
> allocation bounds, a drawdown limit. The AI's only permission is
> rebalance — it cannot withdraw, and it cannot exceed the bounds.
> Watch it try."

Action: show mandate card ("On breach: FREEZE") + separation-of-powers card
(3s each). Cut to terminal:

```bash
bash scripts/scene1-violation.sh
```

Zoom on: `MandateViolation: asset[0] target=0bps outside [2000, 10000]` —
> "Out-of-bounds proposal. The chain just said no."

### 0:35–1:00 — RFQ execution, no MEV  ·  [terminal → Tab B timeline]

> "Execution never touches a public mempool. The agent collects signed
> quotes from market makers, picks the best against oracle mid, and settles
> atomically at the signed price. Nothing to sandwich, no slippage curve —
> and the fill quality is recorded on-chain."

Action: terminal:

```bash
bash scripts/scene2-rfq.sh
```

Zoom on the two `TCA fill … (+4bps)` lines. Then Tab B: "And here is the
same thing live on Mantle Sepolia" — point at the decision timeline's
`+4 bps` badges and a `Playbook v1` badge.

### 1:00–1:18 — Breach response  ·  [terminal → Tab B header]

> "When the market crashes through the drawdown limit, anyone can trip the
> vault. Default behavior: FREEZE — suspend the agent and hold positions.
> No forced dump into a falling market."

Action: terminal:

```bash
bash scripts/scene3-drawdown.sh $MMETH 990
```

Zoom: `tripped=true … positions held`. Cut to Tab B: Tripped badge,
allocation bar still showing the risk sleeve (held, not dumped).

### 1:18–1:40 — Proof  ·  [terminal → Tab B Verify button]

> "Every decision logs its inputs, the AI's raw proposal, and its
> reasoning. Anyone can replay it from chain data alone."

Action: terminal:

```bash
bash scripts/scene4-verify.sh 2 $VAULT          # VERIFIED ✓
```

Zoom on `VERDICT: VERIFIED ✓`, then immediately the tamper run output
`VERDICT: TAMPERED ✗` —
> "Flip one character, it screams."

Then Tab B: click 🔍 Verify in the browser → checkmarks.
(If confidential decisions shipped: paste the demo viewing key, narrate
> "Strategy context is encrypted on-chain — the auditor's key unlocks full
> verification; the public still sees integrity and execution quality.")

### 1:40–2:05 — Arena + close  ·  [Tab C → Tab D]

> "Same rails, different brains: real free-tier LLMs — gpt-oss, gemma,
> nemotron — each caged in its own vault, scored on-chain on execution
> quality, never alpha. When nemotron's free tier rate-limited, the agent
> fell back to its deterministic path, the chain recorded it honestly —
> and the leaderboard ranks it last on autonomy."

Action: Tab C arena table, hover score column. Flash Tab D (verified
RFQVenue on mantlescan) for 2s.

> "A fully logged, replay-verifiable AI decision costs about a tenth of an
> MNT in gas — auditability is economical on Mantle. AI executes. The
> mandate protects. The chain proves it. MandateVault."

End card (3s): repo URL + mandate-vault.pages.dev + "Mantle Sepolia ·
all contracts verified".

---

## Recording tips

- Record terminal takes FIRST (anvil chain from prep stays warm).
- One scene per take; stitch in any editor; 2× speed-up dead waits.
- If the live site rate-limits during recording, hard-refresh once and
  wait 10s — the retry transport recovers; or record Tab B/C earlier in
  the session.
- Keep the honesty beats (demo MMs ours / fallback ranked last) — they
  land better than polish.
