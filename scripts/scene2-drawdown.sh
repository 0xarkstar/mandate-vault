#!/usr/bin/env bash
# Demo scene 2 — automatic drawdown trip, no human in the loop.
#
# 1. Crash the mMETH oracle price by 40% (MockOracle setPrice via ORACLE_OWNER_KEY).
# 2. Anyone calls tripCheck() — the vault detects the share-price breach, force-
#    swaps every sleeve into the safe asset (mUSD) and suspends the agent.
# 3. Print tripped state + allocation (expect ~100% safe asset).
#
# Requires agent/.env with ORACLE_ADDRESS, ORACLE_OWNER_KEY, VAULT_ADDRESS,
# PRIVATE_KEY. Pass the mMETH token address as $1 (the risk sleeve to crash).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/agent"

if [ -f .env ]; then set -a; . ./.env; set +a; fi

MMETH_ADDR="${1:-${MMETH_ADDRESS:-}}"
NEW_PRICE="${2:-1800}"   # crashed mMETH price in USD (e.g. 3000 -> 1800 = -40%)

if [ -z "$MMETH_ADDR" ]; then
  echo "usage: scene2-drawdown.sh <mMETH_token_address> [crashed_price_usd]" >&2
  echo "       (or set MMETH_ADDRESS in agent/.env)" >&2
  exit 1
fi

echo "=== Scene 2: crash mMETH price to ${NEW_PRICE} USD ==="
pnpm --filter @mandate-vault/agent exec tsx src/tools/set-price.ts --asset "$MMETH_ADDR" --price "$NEW_PRICE"

echo "=== Scene 2: trigger the keeper drawdown trip ==="
pnpm --filter @mandate-vault/agent exec tsx src/tools/trip-check.ts --vault "$VAULT_ADDRESS"

echo "=== Scene 2 complete: vault tripped, de-risked to safe asset, agent suspended ==="
