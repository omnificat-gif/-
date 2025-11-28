#!/bin/bash
set -e

export CHROME_PATH=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo "/usr/bin/chromium-browser")
mkdir -p tokens

echo ">>> Chrome path: $CHROME_PATH"

# Check if DISPLAY is already set (we might be called from multi_gen)
if [ -z "$DISPLAY" ]; then
    echo ">>> Starting Xvfb..."
    pkill -9 Xvfb 2>/dev/null || true
    sleep 1
    export DISPLAY=:99
    Xvfb :99 -screen 0 1920x1080x24 -ac &
    XVFB_PID=$!
    sleep 2
    STARTED_XVFB=1
else
    echo ">>> Using existing DISPLAY=$DISPLAY"
    STARTED_XVFB=0
fi

echo ">>> Running single generator..."
node single_gen.js
EXIT_CODE=$?

# Cleanup
pkill -9 -f chromium 2>/dev/null || true
if [ "$STARTED_XVFB" = "1" ]; then
    kill $XVFB_PID 2>/dev/null || true
fi

# Show result
if [ -f tokens/token.txt ]; then
    echo ""
    echo "=========================================="
    echo "TOKEN: $(cat tokens/token.txt)"
    echo "=========================================="
fi

exit $EXIT_CODE
