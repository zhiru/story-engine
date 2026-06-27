#!/usr/bin/env bash
set +e
echo "=== raise subdomain limit (jessicanaiara) ==="
plesk bin subscription --update jessicanaiara.com.br -max_subdom -1 2>&1 | tail -3
echo "=== create single ==="
plesk bin subdomain --create single.storygen -domain jessicanaiara.com.br 2>&1 | tail -3
echo "=== repair web (gera vhosts) ==="
plesk repair web single.storygen.jessicanaiara.com.br -y 2>&1 | tail -3
plesk repair web multi.storygen.jessicanaiara.com.br -y 2>&1 | tail -3
echo "=== nginx server block: single ==="
nginx -T 2>/dev/null | grep -A 22 'server_name single.storygen.jessicanaiara.com.br'
echo "=== nginx server block: multi ==="
nginx -T 2>/dev/null | grep -A 22 'server_name multi.storygen.jessicanaiara.com.br'
echo DONE
