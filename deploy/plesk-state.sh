#!/usr/bin/env bash
set +e
echo "=== Apache vhosts storygen ==="
apachectl -S 2>/dev/null | grep -i storygen
echo "=== nginx refs storygen (count) ==="
nginx -T 2>/dev/null | grep -c storygen
echo "=== single existe? ==="
plesk bin subdomain --info single.storygen.jessicanaiara.com.br 2>/dev/null | grep -i 'Domain name'
echo "=== multi existe? ==="
plesk bin subdomain --info multi.storygen.jessicanaiara.com.br 2>/dev/null | grep -i 'Domain name'
echo "=== containers ==="
cd /root/deploys/story-engine && docker compose -f docker-compose.prod.yml ps --format '{{.Service}} {{.Status}}'
