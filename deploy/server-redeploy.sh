#!/usr/bin/env bash
# Redeploy: rebuild web (URLs publicas) + rebuild imagem da API + restart.
# Preserva apps/api/.env existente (NAO regenera segredos).
set -euo pipefail
cd "$(dirname "$0")/.."
SINGLE_URL="https://single.storygen.jessicanaiara.com.br"
MULTI_URL="https://multi.storygen.jessicanaiara.com.br"

echo "[1/3] build web (node:22)"
docker run --rm -v "$PWD":/app -w /app \
  -e SINGLE_API_URL="$SINGLE_URL" -e MULTI_API_URL="$MULTI_URL" \
  node:22-bookworm bash -c "corepack enable && corepack prepare pnpm@10.22.0 --activate && pnpm install && bash scripts/build-demo-web.sh"

echo "[2/3] rebuild API image + up"
docker compose -f docker-compose.prod.yml up -d --build

echo "[3/3] status"
docker compose -f docker-compose.prod.yml ps
echo REDEPLOY_DONE
