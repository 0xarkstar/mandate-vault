#!/usr/bin/env bash
# Regenerate ABI JSON files from compiled contracts.
set -euo pipefail
cd "$(dirname "$0")/../../contracts"
mkdir -p ../packages/abi/src
for c in MandateVault VaultFactory MockERC20 MockOracle MockVenue; do
  forge inspect "$c" abi --json > "../packages/abi/src/${c}.json"
  echo "wrote src/${c}.json"
done
