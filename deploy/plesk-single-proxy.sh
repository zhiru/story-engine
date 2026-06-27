#!/usr/bin/env bash
set +e
D=single.storygen.jessicanaiara.com.br
CONF=/var/www/vhosts/system/$D/conf
mkdir -p "$CONF"
# Additional Apache directives: proxy tudo p/ o container web-single (nginx interno
# que serve estatico + faz proxy /api -> api).
cat > "$CONF/vhost.conf" <<'EOF'
ProxyPreserveHost On
ProxyPass / http://127.0.0.1:18080/
ProxyPassReverse / http://127.0.0.1:18080/
EOF
cp "$CONF/vhost.conf" "$CONF/vhost_ssl.conf"
echo "=== reconfigure-domain ==="
plesk sbin httpdmng --reconfigure-domain "$D" 2>&1 | tail -6
echo "=== apachectl -t ==="
apachectl -t 2>&1 | tail -2
echo "=== curl Apache direto (7080) com Host ==="
curl -s -m 10 -H "Host: $D" http://127.0.0.1:7080/ | head -c 220
echo
echo "=== curl /health via Apache ==="
curl -s -m 10 -H "Host: $D" http://127.0.0.1:7080/health
echo
echo DONE
