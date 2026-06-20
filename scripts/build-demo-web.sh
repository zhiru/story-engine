#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Build cada tenant escrevendo apps/mobile/.env ANTES do export — o Expo carrega
# esse .env (env inline no comando NÃO chega ao app.config). EXPO_PUBLIC_API_URL
# vazio => apiUrl relativo (mesma origem, via proxy nginx).
build() {
  local slug="$1" mode="$2" out="$3" apiurl="$4"
  # EXPO_PUBLIC_* são inlinados no bundle (garantido pelo Expo). O app lê o slug
  # daqui; o modo vem do /config (servidor) com base no slug. EXPO_PUBLIC_API_URL
  # = origem pública do próprio subdomínio (o nginx do web faz proxy /api -> api).
  printf 'EXPO_PUBLIC_APP_SLUG=%s\nEXPO_PUBLIC_API_URL=%s\nAPP_SLUG=%s\nAPP_MODE=%s\n' "$slug" "$apiurl" "$slug" "$mode" > apps/mobile/.env
  rm -rf apps/mobile/dist apps/mobile/.expo
  # --clear: limpa o cache do Metro entre tenants (senão o 2º export reusa o
  # transform inlinado do 1º e baka o slug errado).
  pnpm --filter ./apps/mobile exec npx expo export -p web --clear
  # copia o conteúdo para dentro do dir existente (preserva o inode).
  mkdir -p "$out"
  find "$out" -mindepth 1 -delete
  cp -r apps/mobile/dist/. "$out"/
  echo "built $out (slug=$slug mode=$mode api=$apiurl)"
}

# URLs da API por tenant — sobrescreva no deploy (ex.: https://single.storygen...).
SINGLE_API_URL="${SINGLE_API_URL:-http://localhost:3000}"
MULTI_API_URL="${MULTI_API_URL:-http://localhost:3000}"

build historias-da-gigi SINGLE deploy/dist-single "$SINGLE_API_URL"
build meu-universo MULTI deploy/dist-multi "$MULTI_API_URL"
echo "OK: deploy/dist-single + deploy/dist-multi"
