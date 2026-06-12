#!/usr/bin/env bash
# Demo scene 4 — third-party replay verification (AC-10).
#
#   scene 4a: verify a real on-chain decision → VERIFIED ✓ (exit 0)
#   scene 4b: re-run with --tamper            → TAMPERED ✗ (exit 1, expected)
#
# usage:   scripts/scene4-verify.sh [epoch] [vault-address]
#          epoch defaults to 1; vault falls back to $VAULT_ADDRESS.
# env:     RPC_URL (optional RPC override), FROM_BLOCK (optional scan start)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EPOCH="${1:-1}"
VAULT="${2:-${VAULT_ADDRESS:-}}"

if [[ -z "$VAULT" ]]; then
  echo "usage: $0 [epoch] [vault-address]   (or set VAULT_ADDRESS)" >&2
  exit 2
fi

run_verifier() {
  (cd "$ROOT/verifier" && pnpm exec tsx src/cli.ts "$@")
}

echo "=== scene 4a: verify epoch $EPOCH on $VAULT ==="
run_verifier --vault "$VAULT" --epoch "$EPOCH" \
  ${FROM_BLOCK:+--from-block "$FROM_BLOCK"}

echo
echo "=== scene 4b: tampered replay of epoch $EPOCH (must show ✗) ==="
if run_verifier --vault "$VAULT" --epoch "$EPOCH" --tamper \
  ${FROM_BLOCK:+--from-block "$FROM_BLOCK"}; then
  echo "ERROR: tampered replay unexpectedly verified" >&2
  exit 1
fi

echo
echo "tamper detected as expected — replay verification works end to end."
