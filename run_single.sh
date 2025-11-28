#!/bin/bash
set -e

export CHROME_PATH=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo "/usr/bin/chromium-browser")
mkdir -p tokens

echo ">>> Chrome: $CHROME_PATH"
echo ">>> Running single token generator..."

xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" node single_gen.js

if [ -f tokens/token.txt ]; then
    echo ""
    echo "=========================================="
    echo "TOKEN: $(cat tokens/token.txt)"
    echo "=========================================="
fi
