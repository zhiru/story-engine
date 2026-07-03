# WP-MULTI — Modo MULTI + Trial automático + Deploy persistente (SINGLE+MULTI)

> REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. WSL/quoting: [[git-via-wsl]] (`bash -lc` p/ pnpm/docker; git msg aspas simples). Postgres Docker 5433. LLM: ver [[llm-gateway-omniroute]] (key em `apps/api/.env`).

**Goal:** Deixar o app testável nos **dois modos**: SINGLE (universo fixo, já pronto) e **MULTI** (usuário comum cria universo/personagens/tema e gera nas próprias histórias). Cadastro novo ganha **assinatura trial** automática (pra gerar na hora). Entregar **dois builds web** (SINGLE `:8080`, MULTI `:8082`) na mesma API+Claude, tudo **persistente via docker-compose** (`restart: unless-stopped`).

**Architecture:** O modo é resolvido **por `app_slug`** (não pelo build): o app envia header `X-App-Slug`; a API lê `app_settings.app_slug → mode`. Dois `app_settings`: `historias-da-gigi` (SINGLE) e `meu-universo` (MULTI). Autorização criativa: SINGLE → só ADMIN/MODERATOR; MULTI → qualquer usuário autenticado cria/edita os **próprios** universos (escopado por `user_id`).

---

## Task 1 (API): modo por app_slug + seed MULTI

**Files:** `apps/api/src/auth/middleware.ts` (ou novo `appContext.ts`), `apps/api/src/repos/appSettings.ts`, `apps/api/src/db/seed.ts`, `apps/api/src/routes/config.ts`

- [ ] **Step 1:** Helper `resolveAppSlug(req)` = header `x-app-slug` (lowercased) ?? `process.env.DEFAULT_APP_SLUG` ?? `"historias-da-gigi"`. `getMode(slug)` lê `app_settings` → `appMode` ("SINGLE"|"MULTI"); slug inexistente → default SINGLE. Exponha `req.appSlug` num preHandler global (ou helper chamado nas rotas).
- [ ] **Step 2:** Seed: adicionar `app_settings` `meu-universo` (mode MULTI, `single_mode_universe_id` NULL, theme próprio). Manter `historias-da-gigi` SINGLE.
- [ ] **Step 3:** `GET /config` usa o slug do request → retorna `{ appMode, singleModeUniverseId (só SINGLE), theme }`.
- [ ] **Step 4:** typecheck. Commit: `feat(api): resolve app mode per app_slug + seed MULTI app_settings`.

## Task 2 (API): CRUD criativo mode-aware + acesso na geração

**Files:** `apps/api/src/routes/creative.ts`, `apps/api/src/repos/*`, `apps/api/src/services/generateStory.ts`

- [ ] **Step 1:** Criativo (`POST /universes`, `/:id/characters`, `/themes`, `/arcs`): permitir se `role ∈ {ADMIN,MODERATOR}` **OU** `getMode(slug)==='MULTI'`. Em MULTI, `createUniverse` usa `userId=actor.id`; para characters/themes/arcs do universo `:id`, exigir que o universo seja **do actor** (ou actor admin) → senão 403/404. Manter `max_universes`.
- [ ] **Step 2:** `GET /universes/mine` (requireAuth) → universos do actor (não deletados) — usado pela home MULTI.
- [ ] **Step 3:** Geração: em `generateStory`, após carregar o universo, checar acesso: ok se `universe.userId===actor.id` OU `actor.role` admin/mod OU o universo é o `single_mode_universe_id` do slug. Senão `GENERATION_FAILED`/403. (SINGLE segue funcionando; MULTI só gera no próprio universo.)
- [ ] **Step 4:** typecheck. Commit: `feat(api): mode-aware creative CRUD + universe access check on generate`.

## Task 3 (API): assinatura trial automática no cadastro

**Files:** `apps/api/src/routes/auth.ts`, `apps/api/src/db/seed.ts`, `apps/api/src/repos/subscriptions.ts`

- [ ] **Step 1:** Seed: plano `TRIAL` (`max_universes=5`, `max_stories_per_month=20`, `price_cents=0`) com id fixo.
- [ ] **Step 2:** No `POST /auth/register`, após criar o user, criar `subscriptions` ACTIVE no plano TRIAL com `current_period_end = now()+30 dias`. Idempotente o suficiente p/ testes.
- [ ] **Step 3:** Teste de integração: usuário recém-registrado consegue (com consentimento) gerar história em MULTI no próprio universo; em SINGLE, usuário comum **não** cria universo (403).
- [ ] **Step 4:** `pnpm --filter ./apps/api test` verde. Commit: `feat(api): auto trial subscription on register + multi/single tests`.

## Task 4 (App): UI mode-aware + header app_slug + dual build

**Files:** `apps/mobile/src/lib/api.ts` (header + multi calls), `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/app/index.tsx` (home mode-aware), novas telas `src/app/create-universe.tsx`, ajustes

- [ ] **Step 1:** `api.ts`: enviar header `X-App-Slug` = `Constants.expoConfig?.extra?.appSlug` (adicionar `appSlug` no `extra` do `app.config.ts`). Adicionar `createUniverse`, `addCharacter`, `addTheme`, `listMyUniverses`.
- [ ] **Step 2:** Home mode-aware: `getConfig()` retorna `appMode`. Se SINGLE → tela atual (universo fixo). Se MULTI → lista `universos do usuário` + botão "Criar universo"; ao selecionar um universo, mostra suas histórias + "Gerar nova historia".
- [ ] **Step 3:** Tela "Criar universo": título, descrição → cria; depois adiciona 1 personagem PRINCIPAL (nome, traços) e 1 tema. Simples, NativeWind.
- [ ] **Step 4:** Gates headless: typecheck; `expo export -p web` bundla. Commit: `feat(mobile): MULTI mode UI (create universe, own list) + app_slug header`.

## Task 5: Deploy persistente (docker-compose, SINGLE+MULTI)

**Files:** `apps/api/Dockerfile`, `deploy/web.Dockerfile` (ou usar imagem estática), `docker-compose.demo.yml`, `deploy/serve-web/*`, `scripts/build-web.sh`

- [ ] **Step 1:** `Dockerfile` da API (node 22, pnpm, build TS, roda `db:migrate && db:seed` no entrypoint, depois `node dist/server.js`). Recebe `DATABASE_URL`, `JWT_*`, `AI_*` via env (do compose, que lê `apps/api/.env` por `env_file`). **Nunca** copiar `.env` pra imagem versionada.
- [ ] **Step 2:** Builds web: `expo export -p web` 2x com env diferente →
  - SINGLE: `APP_SLUG=historias-da-gigi APP_MODE=SINGLE EXPO_PUBLIC_API_URL=<api>` → `dist-single/`
  - MULTI: `APP_SLUG=meu-universo APP_MODE=MULTI EXPO_PUBLIC_API_URL=<api>` → `dist-multi/`
  Servidos por um container estático (caddy/nginx) — SINGLE na `8080`, MULTI na `8082`.
  > **API URL nos builds:** usar a URL que o **navegador do host** alcança a API. Se o forwarding localhost do WSL funciona, `http://localhost:3000`; senão o IP do WSL. Validar com curl do host (ou assumir localhost e documentar fallback).
- [ ] **Step 3:** `docker-compose.demo.yml`: serviços `postgres` (5433), `api` (3000, `env_file: apps/api/.env`, `depends_on` postgres healthy, `restart: unless-stopped`), `web-single` (8080), `web-multi` (8082). Postgres com volume nomeado.
- [ ] **Step 4:** `docker compose -f docker-compose.demo.yml up -d --build` → tudo de pé. `restart: unless-stopped` garante persistência.
- [ ] **Step 5:** Commit (sem segredos): `feat(deploy): docker-compose demo (postgres+api+web single/multi), persistent`.

## Verificação final (headless, os DOIS modos)
- [ ] **SINGLE:** `X-App-Slug: historias-da-gigi` → login admin → `/config` SINGLE → gerar no universo fixo → ler.
- [ ] **MULTI:** `X-App-Slug: meu-universo` → registrar novo user → consent → criar universo → gerar nele → ler. Outro user **não** vê o universo do primeiro (isolamento).
- [ ] `pnpm ci:local` verde.
- [ ] Containers `up` com `restart: unless-stopped`; `curl :3000/health`, `:8080`, `:8082` → 200.

**Done:** SINGLE (`:8080`) e MULTI (`:8082`) no ar, persistentes, gerando via Claude. Credenciais: admin `admin@storygen.dev/admin123` (SINGLE); em MULTI, registrar conta nova.

## Self-Review
- Modo por slug (não build) → uma API serve os dois tenants. ✓
- MULTI isolado por `user_id`; SINGLE restrito a admin. ✓
- Trial auto → cadastro novo gera. ✓ · Persistência via compose restart. ✓ · Key fora do git. ✓
