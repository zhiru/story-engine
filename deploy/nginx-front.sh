#!/usr/bin/env bash
# Bloco nginx standalone (front) roteando os 2 hostnames -> containers.
# Necessário porque o Plesk (bug UTF-8) nao gera o vhost nginx do subdominio.
# Casa por server_name (Host), entao nem depende do subdominio existir no Plesk.
set +e
echo "=== /etc/nginx/conf.d incluido pelo nginx.conf? ==="
grep -n "conf.d" /etc/nginx/nginx.conf | head

cat > /etc/nginx/conf.d/zz-storygen.conf <<'EOF'
# StoryGen demo (gerado pelo deploy) — remover este arquivo desativa.
server {
    listen 80;
    server_name single.storygen.jessicanaiara.com.br;
    location / {
        proxy_pass http://127.0.0.1:18080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server {
    listen 80;
    server_name multi.storygen.jessicanaiara.com.br;
    location / {
        proxy_pass http://127.0.0.1:18082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

echo "=== nginx -t ==="
nginx -t 2>&1 | tail -4
if nginx -t >/dev/null 2>&1; then
  nginx -s reload 2>&1 | tail -2
  echo "RELOADED_OK"
else
  echo "NGINX_TEST_FAIL -> removendo p/ nao quebrar nada"
  rm -f /etc/nginx/conf.d/zz-storygen.conf
  exit 1
fi

echo "=== teste single :80 (Host) ==="
curl -s -m 12 --resolve single.storygen.jessicanaiara.com.br:80:127.0.0.1 http://single.storygen.jessicanaiara.com.br/ -o /tmp/s.html -w "HTTP %{http_code}\n"
head -c 130 /tmp/s.html; echo
echo "=== teste multi :80 (Host) ==="
curl -s -m 12 --resolve multi.storygen.jessicanaiara.com.br:80:127.0.0.1 http://multi.storygen.jessicanaiara.com.br/ -o /tmp/m.html -w "HTTP %{http_code}\n"
head -c 130 /tmp/m.html; echo
echo "=== /api/v1/config single (espera 401) ==="
curl -s -m 12 --resolve single.storygen.jessicanaiara.com.br:80:127.0.0.1 http://single.storygen.jessicanaiara.com.br/api/v1/config -w "  [HTTP %{http_code}]\n"
