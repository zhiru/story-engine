#!/usr/bin/env bash
set +e
for D in single.storygen.jessicanaiara.com.br multi.storygen.jessicanaiara.com.br; do
  echo "######## $D ########"
  echo "=== info ==="
  plesk bin subdomain --info "$D" 2>&1 | head -8
  echo "=== conf dir ==="
  ls -la "/var/www/vhosts/system/$D/conf/" 2>&1
  echo "=== generated nginx vhost ==="
  for f in "/etc/nginx/plesk.conf.d/vhosts/$D.conf" "/var/www/vhosts/system/$D/conf/last_nginx.conf"; do
    if [ -f "$f" ]; then echo "--- $f ---"; cat "$f"; fi
  done
  echo "=== existing vhost_nginx.conf ==="
  cat "/var/www/vhosts/system/$D/conf/vhost_nginx.conf" 2>&1
  echo
done
