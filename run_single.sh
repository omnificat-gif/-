#!/bin/bash
mkdir -p tokens
node single_gen.js
if [ -f tokens/token.txt ]; then
    echo "=========================================="
    echo "TOKEN: $(cat tokens/token.txt)"
    echo "=========================================="
fi
