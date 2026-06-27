#!/usr/bin/env bash
set +e
echo "=== flags de limite (subscription --help) ==="
plesk bin subscription --help 2>&1 | grep -iE 'subdom|max|limit'
echo
echo "=== info da assinatura (limites) ==="
plesk bin subscription --info jessicanaiara.com.br 2>/dev/null | head -70
