#!/bin/bash
set -e

export CHROME_PATH=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo "/usr/bin/chromium-browser")
export NUM_RUNS=${1:-5}
mkdir -p tokens

echo ">>> Chrome: $CHROME_PATH"
echo ">>> Running $NUM_RUNS token generations..."

xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" node multi_gen.js

if [ -f tokens/all_tokens.txt ]; then
    echo ""
    echo "=========================================="
    echo "GENERATED TOKENS:"
    cat tokens/all_tokens.txt
    echo "=========================================="
fi
