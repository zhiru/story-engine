#!/usr/bin/env bash
# Bootstrap do StoryGen no servidor (rodar em /root/deploys/story-engine).
# AI_API_KEY vem do ambiente (NÃO hardcode aqui — é segredo).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${AI_API_KEY:?AI_API_KEY required}"

SINGLE_URL="https://single.storygen.jessicanaiara.com.br"
MULTI_URL="https://multi.storygen.jessicanaiara.com.br"

# [1] .env da API (segredos só aqui; o compose sobrescreve DATABASE_URL p/ o postgres interno)
JWT_A="$(openssl rand -hex 48)"; JWT_R="$(openssl rand -hex 48)"
cat > apps/api/.env <<EOF
DATABASE_URL=postgres://postgres:postgres@postgres:5432/storygen
PORT=3000
JWT_ACCESS_SECRET=$JWT_A
JWT_REFRESH_SECRET=$JWT_R
AI_BASE_URL=https://omni.neuraltalk.com.br/v1
AI_API_KEY=$AI_API_KEY
AI_MODEL=cc/claude-haiku-4-5-20251001
EOF
chmod 600 apps/api/.env
echo "[1/3] apps/api/.env escrito"

# [2] build dos 2 web (dentro de node:22, URLs públicas por subdomínio)
docker run --rm -v "$PWD":/app -w /app \
  -e SINGLE_API_URL="$SINGLE_URL" -e MULTI_API_URL="$MULTI_URL" \
  node:22-bookworm bash -c "corepack enable && corepack prepare pnpm@10.22.0 --activate && pnpm install && bash scripts/build-demo-web.sh"
echo "[2/3] web buildado (single -> $SINGLE_URL, multi -> $MULTI_URL)"

# [3] build da imagem da API + sobe a stack
docker compose -f docker-compose.prod.yml up -d --build
echo "[3/3] stack no ar:"
docker compose -f docker-compose.prod.yml ps
echo "BOOTSTRAP_DONE"
