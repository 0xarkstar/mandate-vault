#!/usr/bin/env bash
# Full local-anvil E2E rehearsal (HANDOFF §8, extended for the RFQ pillar).
#
#   anvil (default chain) → deploy stack → demo vault (60s cooldown, FREEZE)
#   → MM setup → deposit → decision 1 (RFQ fill + TCA)
#   → scene 1 violation (cage holds) → scene 2 RFQ risk-on (TCA improvement)
#   → learn (PolicyIndex v1) → decision 3 (playbookVersion stamped)
#   → scene 3 crash + FREEZE trip → scene 4 verify (VERIFIED + TAMPERED)
#   → web production build
#
# Self-contained: generates fresh burner keys per run (cast wallet new), funds
# them via anvil_setBalance — no well-known key literals anywhere. Takes ~4min
# (two 60s cooldown waits). Usage: scripts/e2e-anvil.sh
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="http://127.0.0.1:8545"
export RPC_URL="$RPC" CHAIN_ID=31337

# ---------------------------------------------------------------- anvil
# KEEP_ANVIL=1 leaves the populated chain running (web preview / screenshots).
ANVIL_PID=""
cleanup() {
  [ "${KEEP_ANVIL:-0}" = "1" ] && return 0
  [ -n "$ANVIL_PID" ] && kill "$ANVIL_PID" 2>/dev/null || true
}
trap cleanup EXIT

if ! cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "=== starting anvil (default chain) ==="
  anvil --silent &
  ANVIL_PID=$!
  for _ in $(seq 1 50); do
    cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
    sleep 0.2
  done
fi

# ---------------------------------------------------------- burner keys
newkey() { cast wallet new | awk '/Address:/{a=$2} /Private key:/{k=$3} END{print a" "k}'; }
fund()   { cast rpc --rpc-url "$RPC" anvil_setBalance "$1" 0x21E19E0C9BAB2400000 >/dev/null; } # 10k ETH

read -r DEPLOYER_ADDR DEPLOYER_KEY <<<"$(newkey)"
read -r AGENT_ADDR    AGENT_KEY    <<<"$(newkey)"
read -r MM_TIGHT_ADDR MM_TIGHT_KEY <<<"$(newkey)"
read -r MM_WIDE_ADDR  MM_WIDE_KEY  <<<"$(newkey)"
fund "$DEPLOYER_ADDR"; fund "$AGENT_ADDR"; fund "$MM_TIGHT_ADDR"; fund "$MM_WIDE_ADDR"
echo "deployer=$DEPLOYER_ADDR agent=$AGENT_ADDR mmTight=$MM_TIGHT_ADDR mmWide=$MM_WIDE_ADDR"

# ---------------------------------------------------------------- deploy
echo "=== deploy stack ==="
DEPLOY_OUT="$(cd "$ROOT/contracts" && PRIVATE_KEY="$DEPLOYER_KEY" AGENT_ADDRESS="$AGENT_ADDR" \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast 2>&1)"
addr_of() { echo "$DEPLOY_OUT" | awk -v k="$1" '$1==k{print $2}' | tail -1; }
MUSD="$(addr_of mUSD)"; MMETH="$(addr_of mMETH)"; MMNT="$(addr_of mMNT)"
ORACLE="$(addr_of oracle)"; VENUE="$(addr_of venue)"; FACTORY="$(addr_of factory)"
echo "factory=$FACTORY venue=$VENUE oracle=$ORACLE"
[ -n "$FACTORY" ] && [ -n "$VENUE" ] || { echo "deploy parse failed"; echo "$DEPLOY_OUT" | tail -30; exit 1; }

# --------------------------------------------------------- demo vault
echo "=== create demo vault (60s cooldown, FREEZE trip) ==="
cd "$ROOT/agent"
VAULT_OUT="$(PRIVATE_KEY="$DEPLOYER_KEY" pnpm --filter @mandate-vault/agent exec tsx src/tools/create-demo-vault.ts \
  --factory "$FACTORY" --agent "$AGENT_ADDR" --cooldown 60 --trip-mode freeze)"
echo "$VAULT_OUT"
VAULT="$(echo "$VAULT_OUT" | awk -F= '/^VAULT_ADDRESS=/{print $2}')"
[ -n "$VAULT" ] || { echo "vault parse failed"; exit 1; }

# A stale PolicyIndex from a previous run would stamp playbookVersion into
# pre-learning decisions — start every rehearsal pre-learning (v0).
rm -f data/policy-index.json

# Common agent env for every subsequent step.
export VAULT_ADDRESS="$VAULT" ORACLE_ADDRESS="$ORACLE" ORACLE_OWNER_KEY="$DEPLOYER_KEY"
export RFQ_VENUE_ADDRESS="$VENUE" MM_KEY_TIGHT="$MM_TIGHT_KEY" MM_KEY_WIDE="$MM_WIDE_KEY"
export OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-offline-rehearsal}" MMETH_ADDRESS="$MMETH"

echo "=== MM inventory + approvals ==="
PRIVATE_KEY="$DEPLOYER_KEY" pnpm --filter @mandate-vault/agent exec tsx src/tools/setup-mms.ts \
  --factory "$FACTORY" --venue "$VENUE"

# ---------------------------------------------------------------- deposit
echo "=== deposit 10,000 mUSD ==="
cast send --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" "$MUSD" "approve(address,uint256)" "$VAULT" "$(cast max-uint)" >/dev/null
cast send --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" "$VAULT" "deposit(uint256)" 10000000000000000000000 >/dev/null
echo "totalValue=$(cast call --rpc-url "$RPC" "$VAULT" 'totalValue()(uint256)')"

# ------------------------------------------------------------- decisions
export PRIVATE_KEY="$AGENT_KEY"

# Scene 1 runs FIRST: rebalance() checks cooldown before bounds, so the
# violation demo must hit a cooldown-free vault to surface MandateViolation
# (the violate tx reverts, so it never starts a cooldown itself).
echo "=== scene 1: violation must revert on-chain (cage holds) ==="
"$ROOT/scripts/scene1-violation.sh"

echo "=== decision 1: full pipeline (deliberation -> clamp -> RFQ -> chain) ==="
pnpm --filter @mandate-vault/agent exec tsx src/main.ts --mode once

echo "=== wait out the 60s cooldown ==="
sleep 62

echo "=== scene 2: RFQ risk-on rebalance (best-quote fill + TCA) ==="
"$ROOT/scripts/scene2-rfq.sh"

echo "=== learning pass: compile PolicyIndex v1 from the on-chain log ==="
PRIVATE_KEY="$DEPLOYER_KEY" pnpm --filter @mandate-vault/agent exec tsx src/tools/learn.ts \
  --vault "$VAULT" --venue "$VENUE"

echo "=== wait out the 60s cooldown ==="
sleep 62

echo "=== decision 3: playbookVersion=1 stamped into the snapshot ==="
pnpm --filter @mandate-vault/agent exec tsx src/main.ts --mode once

echo "=== scene 3: crash + drawdown trip (FREEZE: positions held, agent suspended) ==="
"$ROOT/scripts/scene3-drawdown.sh" "$MMETH" 990
echo "tripped=$(cast call --rpc-url "$RPC" "$VAULT" 'tripped()(bool)')"
echo "mMETH balance held by vault: $(cast call --rpc-url "$RPC" "$MMETH" 'balanceOf(address)(uint256)' "$VAULT")"

echo "=== scene 4: third-party replay verification (epoch 2: the RFQ decision) ==="
VAULT_ADDRESS="$VAULT" RPC_URL="$RPC" "$ROOT/scripts/scene4-verify.sh" 2 "$VAULT"

# ------------------------------------------------------------------ web
echo "=== web production build ==="
cd "$ROOT"
VITE_FACTORY_ADDRESS="$FACTORY" VITE_RPC_URL="$RPC" VITE_CHAIN_ID=31337 \
  pnpm --filter @mandate-vault/web build

echo
echo "E2E REHEARSAL COMPLETE"
echo "  factory=$FACTORY vault=$VAULT venue=$VENUE oracle=$ORACLE"
echo "  preview the dashboard:  VITE_FACTORY_ADDRESS=$FACTORY VITE_RPC_URL=$RPC VITE_CHAIN_ID=31337 pnpm --filter @mandate-vault/web exec vite preview"
