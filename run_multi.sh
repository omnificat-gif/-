#!/bin/bash
set -e

export CHROME_PATH=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo "/usr/bin/chromium-browser")
export NUM_RUNS=${1:-5}
mkdir -p tokens

echo ">>> Chrome path: $CHROME_PATH"
echo ">>> Will generate $NUM_RUNS tokens"

# Kill any existing Xvfb/chromium
pkill -9 Xvfb 2>/dev/null || true
pkill -9 -f chromium 2>/dev/null || true
sleep 1

# Start Xvfb manually (not xvfb-run) so child processes inherit DISPLAY
export DISPLAY=:99
Xvfb :99 -screen 0 1920x1080x24 -ac &
XVFB_PID=$!
sleep 2

echo ">>> Xvfb started on DISPLAY=:99 (PID: $XVFB_PID)"

# Run the multi generator
node multi_gen.js
EXIT_CODE=$?

# Cleanup
echo ">>> Cleaning up..."
kill $XVFB_PID 2>/dev/null || true
pkill -9 -f chromium 2>/dev/null || true

# Show results
echo ""
echo "=========================================="
echo "GENERATED TOKENS:"
echo "=========================================="
cat tokens/all_tokens.txt 2>/dev/null || echo "(none)"
echo "=========================================="

exit $EXIT_CODE
