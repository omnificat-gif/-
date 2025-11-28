#!/bin/bash
set -e

mkdir -p tokens

echo ">>> Running single generator..."
node single_gen.js
EXIT_CODE=$?

if [ -f tokens/token.txt ]; then
    echo ""
    echo "=========================================="
    echo "TOKEN: $(cat tokens/token.txt)"
    echo "=========================================="
fi

exit $EXIT_CODE
