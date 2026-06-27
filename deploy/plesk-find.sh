#!/usr/bin/env bash
set +e
echo "=== create single (idempotente) ==="
plesk bin subdomain --create single.storygen -domain jessicanaiara.com.br 2>&1 | tail -2
echo "=== nginx config files referencing multi.storygen ==="
grep -rl multi.storygen.jessicanaiara.com.br /etc/nginx/ 2>/dev/null
echo "=== effective nginx server block for multi.storygen ==="
nginx -T 2>/dev/null | grep -n -A 30 'server_name multi.storygen.jessicanaiara.com.br'
