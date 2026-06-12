#!/usr/bin/env bash
# Demo scene 2 — RFQ execution: signed quotes → best pick → atomic fill.
#
# Two DEMO market makers (ours, labeled) sign EIP-712 quotes for the rebalance
# legs: demo-mm-tight (+5bps better than oracle mid) and demo-mm-wide (−40bps).
# The agent's execution engine (NO LLM) verifies signatures, picks the better
# quote, gates on slippage, posts it to RFQVenue, and the vault's rebalance()
# consumes it — settling vault↔MM atomically at the quoted price. The venue
# records TCA on-chain (QuoteFilled: fill vs mid, improvement bps).
#
# Requires agent/.env with VAULT_ADDRESS, ORACLE_ADDRESS, RFQ_VENUE_ADDRESS,
# MM_KEY_TIGHT, MM_KEY_WIDE (+ the usual PRIVATE_KEY/RPC_URL/CHAIN_ID).
# Run setup-mms once beforehand (MM inventory + approvals):
#   pnpm --filter @mandate-vault/agent exec tsx src/tools/setup-mms.ts \
#       --factory 0xFACTORY --venue 0xVENUE
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/agent"

# .env is the manual-demo default; an orchestrator (e2e-anvil.sh) injects env
# directly and must not be overridden by stale .env values.
if [ -z "${VAULT_ADDRESS:-}" ] && [ -f .env ]; then set -a; . ./.env; set +a; fi

if [ -z "${RFQ_VENUE_ADDRESS:-}" ] || [ -z "${MM_KEY_TIGHT:-}" ] || [ -z "${MM_KEY_WIDE:-}" ]; then
  echo "RFQ_VENUE_ADDRESS / MM_KEY_TIGHT / MM_KEY_WIDE must be set (agent/.env)" >&2
  exit 1
fi

# Deterministic risk-on target through the NORMAL pipeline (snapshot + clamp +
# on-chain log) so the rebalance has real legs to fill via RFQ.
FORCE_TARGET="${FORCE_TARGET:-3000,6500,500}"

echo "=== Scene 2: RFQ quotes -> best pick -> atomic fill (TCA on-chain) ==="
pnpm --filter @mandate-vault/agent exec tsx src/main.ts --mode once --force-target "$FORCE_TARGET"

echo "=== Scene 2 complete: fills settled at the quoted price; QuoteFilled TCA logged ==="
