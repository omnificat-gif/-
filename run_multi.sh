#!/bin/bash
export NUM_RUNS=${1:-5}
mkdir -p tokens
node multi_gen.js
echo "=========================================="
echo "ALL TOKENS:"
cat tokens/all_tokens.txt 2>/dev/null || echo "(none)"
echo "=========================================="
