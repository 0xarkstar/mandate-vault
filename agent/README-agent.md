# MandateVault Agent Daemon

Autonomous agent that drives a `MandateVault` on Mantle Sepolia:

```
collect inputs → LLM proposes → clamp-core cages → submit rebalance() on-chain
```

The LLM is free to propose anything; the **clamp** (off-chain, shared with the
verifier) plus the **on-chain re-check** in `rebalance()` is what cages it. A
drawdown breach trips the vault and force-de-risks to the safe asset with no
human in the loop.

## Setup

```bash
cp agent/.env.example agent/.env   # then fill in the values
```

| Var | Required | Purpose |
|---|---|---|
| `PRIVATE_KEY` | yes | Agent EOA; must equal the vault's `mandate.agent` |
| `RPC_URL` | no (default Mantle Sepolia) | Overridable RPC endpoint |
| `CHAIN_ID` | no (default 5003) | Mantle Sepolia chainId |
| `VAULT_ADDRESS` | yes (or `--vault`) | Target MandateVault |
| `OPENROUTER_API_KEY` | yes | LLM proposal step |
| `ORACLE_ADDRESS` | yes | Agent reads asset prices from MockOracle |
| `ORACLE_OWNER_KEY` | sim/scene 2 only | Nudges/crashes oracle prices |
| `FUNDING_SYMBOL` | no (default ETHUSDT) | Binance carry feed symbol |

## CLI

```bash
# one decision cycle (LLM → clamp → rebalance)
pnpm --filter @mandate-vault/agent exec tsx src/main.ts --mode once [--vault 0x..]

# scene 1: submit a raw out-of-bounds target, expect on-chain revert (exit 0)
pnpm --filter @mandate-vault/agent exec tsx src/main.ts --mode once --violate

# accelerated simulation: N decisions on a short-cooldown vault (AC-9)
pnpm --filter @mandate-vault/agent exec tsx src/main.ts --mode sim --steps 12
```

### LLM model fallback chain

`openai/gpt-oss-120b:free` → `qwen/qwen3-next-80b-a3b-instruct:free` →
`meta-llama/llama-3.3-70b-instruct:free`. 2 attempts per model, temperature 0.
On total failure the agent uses a deterministic hold-position fallback
(`fallbackAllocation`) and records `llmFallback: true` in the snapshot — it never
stalls.

## Demo vault (short cooldown) for the sim

Template vaults use a **1h** `rebalanceCooldown`, so the accelerated sim uses a
custom vault with `rebalanceCooldown = 60s` created via
`VaultFactory.createCustomVault`:

```bash
pnpm --filter @mandate-vault/agent exec tsx src/tools/create-demo-vault.ts \
    --factory 0xFACTORY --agent 0xAGENT [--cooldown 60]
# prints: VAULT_ADDRESS=0x... → set this in agent/.env
```

The sim still polls/sleeps until each cooldown elapses (with a 30-minute
wall-clock guard), so it works against any cooldown — the 60s vault just makes
≥10 decisions practical in one session.

## Tools

```bash
# set / crash a MockOracle price (scene 2)
tsx src/tools/set-price.ts --asset 0xMMETH --price 1800

# trigger the public keeper drawdown trip and print the result (scene 2)
tsx src/tools/trip-check.ts --vault 0xVAULT
```

## Demo scenes (scripts/)

| Script | What it proves |
|---|---|
| `scene1-violation.sh` | Out-of-bounds rebalance reverts on-chain (`MandateViolation`) |
| `scene2-drawdown.sh <mMETH_addr> [price]` | Price crash → `tripCheck()` → 100% safe + agent suspended |
| `populate-timeline.sh [steps]` | Runs `sim --steps N` to fill the decision timeline |

Each script sources `agent/.env` automatically.

## Snapshot contract

The agent assembles a `Snapshot` matching `SnapshotSchema` from `clamp-core`
exactly (prices keyed by lowercase asset address as 1e18 decimal strings,
`vault` lowercase, `vaultState.{sharePrice,hwm}` as decimal strings,
`llmFallback` only when the LLM failed). `canonicalJson(snapshot)` is what is
emitted on-chain, so the verifier recomputes byte-identical hashes.

## Tests

```bash
pnpm --filter @mandate-vault/agent typecheck
pnpm --filter @mandate-vault/agent test
```

Unit tests are network-free (pure-logic only): snapshot assembly + canonical
stability, LLM response parsing (fenced JSON + garbage fallback), funding mean
computation, violate-target construction, config validation, and the
deterministic sim price path.
