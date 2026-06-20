#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Build cada tenant escrevendo apps/mobile/.env ANTES do export — o Expo carrega
# esse .env (env inline no comando NÃO chega ao app.config). EXPO_PUBLIC_API_URL
# vazio => apiUrl relativo (mesma origem, via proxy nginx).
build() {
  local slug="$1" mode="$2" out="$3"
  # EXPO_PUBLIC_* são inlinados no bundle (garantido pelo Expo). O app lê o slug
  # daqui; o modo vem do /config (servidor) com base no slug. API em :3000 é
  # publicada pelo Docker Desktop no localhost do host.
  printf 'EXPO_PUBLIC_APP_SLUG=%s\nEXPO_PUBLIC_API_URL=http://localhost:3000\nAPP_SLUG=%s\nAPP_MODE=%s\n' "$slug" "$slug" "$mode" > apps/mobile/.env
  rm -rf apps/mobile/dist apps/mobile/.expo
  # --clear: limpa o cache do Metro entre tenants (senão o 2º export reusa o
  # transform inlinado do 1º e baka o slug errado).
  pnpm --filter ./apps/mobile exec npx expo export -p web --clear
  # copia o conteúdo para dentro do dir existente (preserva o inode -> não quebra
  # o bind-mount do Docker Desktop). Não usar `rm -rf "$out"` (quebraria o mount).
  mkdir -p "$out"
  find "$out" -mindepth 1 -delete
  cp -r apps/mobile/dist/. "$out"/
  echo "built $out (slug=$slug mode=$mode)"
}

build historias-da-gigi SINGLE deploy/dist-single
build meu-universo MULTI deploy/dist-multi
echo "OK: deploy/dist-single + deploy/dist-multi"
