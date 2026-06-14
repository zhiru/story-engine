#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf deploy/dist-single deploy/dist-multi apps/mobile/dist
APP_SLUG=historias-da-gigi APP_MODE=SINGLE EXPO_PUBLIC_API_URL='' pnpm --filter ./apps/mobile exec npx expo export -p web
mv apps/mobile/dist deploy/dist-single
APP_SLUG=meu-universo APP_MODE=MULTI EXPO_PUBLIC_API_URL='' pnpm --filter ./apps/mobile exec npx expo export -p web
mv apps/mobile/dist deploy/dist-multi
echo "OK: deploy/dist-single + deploy/dist-multi"
