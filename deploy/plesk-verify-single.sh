#!/usr/bin/env bash
set +e
D=single.storygen.jessicanaiara.com.br
echo "=== / (cadeia nginx443 -> apache -> container) ==="
curl -sk -m 12 --resolve $D:443:127.0.0.1 https://$D/ -o /tmp/se_root.html -w "HTTP %{http_code}\n"
echo "--- body (250) ---"; head -c 250 /tmp/se_root.html; echo
echo "=== /health ==="
curl -sk -m 12 --resolve $D:443:127.0.0.1 https://$D/health -w "  [HTTP %{http_code}]\n"
echo "=== /api/v1/config (sem auth -> espera 401) ==="
curl -sk -m 12 --resolve $D:443:127.0.0.1 https://$D/api/v1/config -w "  [HTTP %{http_code}]\n"
