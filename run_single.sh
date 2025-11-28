#!/bin/bash
set -e

export CHROME_PATH=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo "/usr/bin/chromium-browser")
mkdir -p tokens

echo ">>> Chrome: $CHROME_PATH"

# Kill any leftover processes
pkill -9 -f chromium 2>/dev/null || true
pkill -9 -f Xvfb 2>/dev/null || true
rm -f /tmp/.X99-lock 2>/dev/null || true
sleep 1

# Use xvfb-run (handles socket creation automatically)
echo ">>> Running with xvfb-run..."
xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24 -ac" node single_gen.js
EXIT_CODE=$?

# Cleanup
pkill -9 -f chromium 2>/dev/null || true

if [ -f tokens/token.txt ]; then
    echo ""
    echo "=========================================="
    echo "TOKEN: $(cat tokens/token.txt)"
    echo "=========================================="
fi

exit $EXIT_CODE
