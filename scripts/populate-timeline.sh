#!/usr/bin/env bash
# Populate the decision timeline (AC-9): run the accelerated sim for N steps.
#
# Drives N decision cycles on a short-cooldown demo vault, nudging the mMETH
# oracle price along a deterministic path. Produces >=10 on-chain decisions for
# the web timeline + verifier.
#
# Use a vault created via create-demo-vault.ts (rebalanceCooldown = 60s):
#   pnpm --filter @mandate-vault/agent exec tsx src/tools/create-demo-vault.ts \
#       --factory 0xFACTORY --agent 0xAGENT
# then set VAULT_ADDRESS in agent/.env to the printed address.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/agent"

# .env is the manual-demo default; an orchestrator (e2e-anvil.sh) injects env
# directly and must not be overridden by stale .env values.
if [ -z "${VAULT_ADDRESS:-}" ] && [ -f .env ]; then set -a; . ./.env; set +a; fi

STEPS="${1:-12}"

echo "=== Populating timeline: sim --steps ${STEPS} ==="
pnpm --filter @mandate-vault/agent exec tsx src/main.ts --mode sim --steps "$STEPS"

echo "=== Timeline populated: ${STEPS} decisions attempted ==="
