#!/usr/bin/env bash
# Demo scene 3 — automatic drawdown trip, no human in the loop.
#
# 1. Crash the mMETH oracle price by 40% (MockOracle setPrice via ORACLE_OWNER_KEY).
# 2. Anyone calls tripCheck() — the vault detects the share-price breach and
#    executes its mandate tripMode:
#      FREEZE (default): suspend the agent, HOLD positions — no forced dump
#                        into the crash.
#      DERISK (opt-in):  sell every sleeve into the safe asset via the venue.
# 3. Print tripped state + allocation.
#
# Requires agent/.env with ORACLE_ADDRESS, ORACLE_OWNER_KEY, VAULT_ADDRESS,
# PRIVATE_KEY. Pass the mMETH token address as $1 (the risk sleeve to crash).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/agent"

# .env is the manual-demo default; an orchestrator (e2e-anvil.sh) injects env
# directly and must not be overridden by stale .env values.
if [ -z "${VAULT_ADDRESS:-}" ] && [ -f .env ]; then set -a; . ./.env; set +a; fi

MMETH_ADDR="${1:-${MMETH_ADDRESS:-}}"
NEW_PRICE="${2:-990}"    # crashed mMETH price in USD (e.g. 1650 -> 990 = -40%)

if [ -z "$MMETH_ADDR" ]; then
  echo "usage: scene3-drawdown.sh <mMETH_token_address> [crashed_price_usd]" >&2
  echo "       (or set MMETH_ADDRESS in agent/.env)" >&2
  exit 1
fi

echo "=== Scene 3: crash mMETH price to ${NEW_PRICE} USD ==="
pnpm --filter @mandate-vault/agent exec tsx src/tools/set-price.ts --asset "$MMETH_ADDR" --price "$NEW_PRICE"

echo "=== Scene 3: trigger the keeper drawdown trip ==="
pnpm --filter @mandate-vault/agent exec tsx src/tools/trip-check.ts --vault "$VAULT_ADDRESS"

echo "=== Scene 3 complete: vault tripped per its tripMode (FREEZE holds positions; DERISK exits to safe), agent suspended ==="
