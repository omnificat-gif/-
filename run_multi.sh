#!/bin/bash
set -e

export CHROME_PATH=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo "/usr/bin/chromium-browser")
export NUM_RUNS=${1:-5}
mkdir -p tokens

echo ">>> Chrome: $CHROME_PATH"
echo ">>> Runs: $NUM_RUNS"

# Cleanup
pkill -9 -f chromium 2>/dev/null || true
pkill -9 -f Xvfb 2>/dev/null || true
rm -f /tmp/.X*-lock 2>/dev/null || true
sleep 1

# Use xvfb-run
echo ">>> Running with xvfb-run..."
xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24 -ac" node multi_gen.js
EXIT_CODE=$?

# Cleanup
pkill -9 -f chromium 2>/dev/null || true

echo ""
echo "=========================================="
echo "ALL TOKENS:"
cat tokens/all_tokens.txt 2>/dev/null || echo "(none)"
echo "=========================================="

exit $EXIT_CODE
