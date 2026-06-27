#!/usr/bin/env bash
set +e
D=single.storygen.jessicanaiara.com.br
echo "=== DNS publico ==="
dig +short "$D" @1.1.1.1
echo "=== resolve local (plesk dns) ==="
dig +short "$D" @127.0.0.1
echo "=== HTTP :80 cadeia (com -i) ==="
curl -s -m 12 -i --resolve "$D:80:127.0.0.1" "http://$D/" | head -25
echo
echo "=== HTTP :80 /health ==="
curl -s -m 12 --resolve "$D:80:127.0.0.1" "http://$D/health" -w "  [HTTP %{http_code}]\n"
