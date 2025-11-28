#!/bin/bash
set -e

export NUM_RUNS=${1:-5}
mkdir -p tokens

echo ">>> Runs: $NUM_RUNS"
echo ">>> Running multi generator..."

node multi_gen.js
EXIT_CODE=$?

echo ""
echo "=========================================="
echo "ALL TOKENS:"
cat tokens/all_tokens.txt 2>/dev/null || echo "(none)"
echo "=========================================="

exit $EXIT_CODE
