#!/usr/bin/env bash
set +e
D=single.storygen.jessicanaiara.com.br
echo "=== nginx tem vhost antes? (conta) ==="
nginx -T 2>/dev/null | grep -c "server_name .*$D"
ls -la /etc/nginx/plesk.conf.d/vhosts/$D.conf 2>&1
echo "=== plesk repair web ==="
plesk repair web "$D" -y 2>&1 | tail -8
echo "=== nginx tem vhost depois? ==="
nginx -T 2>/dev/null | grep -c "server_name .*$D"
ls -la /etc/nginx/plesk.conf.d/vhosts/$D.conf 2>&1
echo "=== teste cadeia :80 ==="
curl -s -m 12 --resolve "$D:80:127.0.0.1" "http://$D/" -o /tmp/r.html -w "HTTP %{http_code}\n"
head -c 200 /tmp/r.html; echo
