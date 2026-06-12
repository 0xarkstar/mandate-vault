#!/usr/bin/env bash
# Demo scene 1 — the cage holds.
#
# The agent submits an intentionally out-of-bounds allocation (--violate),
# bypassing the off-chain clamp. The on-chain re-check in rebalance() reverts
# with MandateViolation. The agent catches it, prints the revert cleanly, and
# exits 0 — proving the mandate is enforced on-chain regardless of the harness.
#
# Requires agent/.env populated (PRIVATE_KEY = mandate.agent, VAULT_ADDRESS,
# ORACLE_ADDRESS, OPENROUTER_API_KEY).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/agent"

# Load agent/.env into the environment (tsx does not auto-load it).
# .env is the manual-demo default; an orchestrator (e2e-anvil.sh) injects env
# directly and must not be overridden by stale .env values.
if [ -z "${VAULT_ADDRESS:-}" ] && [ -f .env ]; then set -a; . ./.env; set +a; fi

echo "=== Scene 1: out-of-bounds rebalance must revert on-chain ==="
pnpm --filter @mandate-vault/agent exec tsx src/main.ts --mode once --violate

echo "=== Scene 1 complete: cage held (revert proven) ==="
