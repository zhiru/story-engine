# WP3 — Modo SINGLE seedado + CRUD admin + UX de leitura — Implementation Plan

> REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. WSL/quoting: ver [[git-via-wsl]] (`bash -lc` p/ pnpm; git msg aspas simples). Postgres Docker porta 5433.

**Goal:** Materializar o modo **SINGLE**: seed de um universo fixo (admin) com personagens + tema + uma história `APPROVED`, resolvido por `app_settings.single_mode_universe_id`. API de leitura (lista de histórias + ler história) e CRUD criativo restrito a ADMIN/MODERATOR com limite `max_universes` (RF-14). App: home lista as histórias do universo fixo e tela de leitura renderiza a história.

**Architecture:** Seed idempotente (`apps/api/src/db/seed.ts`, `pnpm db:seed`). Rotas de leitura abertas a usuário autenticado (só `APPROVED`). CRUD criativo com `requireRole('ADMIN','MODERATOR')`; em modo SINGLE o cliente comum não cria. Modo lido do banco (`app_settings`), não do `APP_MODE` de build.

**Cobre:** RF-10..13, RF-14 (universos), RF-46 (config), RNF-02/06, Seção 10.

---

## Task 1: Seed do modo SINGLE

**Files:** `apps/api/src/db/seed.ts`, `apps/api/package.json` (script `db:seed`), root `package.json` (`db:seed`)

- [ ] **Step 1:** `seed.ts` idempotente (usa email/slug fixos; `onConflictDoNothing` ou checagem):
  - admin user (`admin@storygen.dev`, role ADMIN, senha hash argon2 `admin123`).
  - universo "Histórias da Gigi" (userId=admin, visibility PUBLIC).
  - 2 personagens (1 PRINCIPAL "Gigi", 1 MASCOTE), 1 tema ("Amizade e Compartilhamento").
  - 1 `stories` `moderation_status='APPROVED'` (title + content de exemplo, `user_id`=admin).
  - `app_settings`: `app_slug='historias-da-gigi'`, `single_mode_universe_id`=id do universo, `theme` (cores), `feature_flags`.
- [ ] **Step 2:** Script `db:seed` = `tsx --env-file .env src/db/seed.ts`. Root `package.json`: `"db:seed": "pnpm --filter \"./apps/api\" run db:seed"`. Incluir `db:seed` no `ci:local` após `db:migrate`.
- [ ] **Step 3:** `pnpm db:up && pnpm db:migrate && pnpm db:seed` → imprime ids seedados; rodar 2x (idempotente, sem duplicar). Commit: `feat(api): SINGLE-mode seed (universe, characters, theme, approved story, app_settings)`.

---

## Task 2: Rotas de config + leitura

**Files:** `apps/api/src/repos/appSettings.ts`, `apps/api/src/repos/stories.ts`, `apps/api/src/routes/config.ts`, `apps/api/src/routes/stories.ts`, `app.ts`

- [ ] **Step 1:** `GET /api/v1/config` (requireAuth) → `{ appMode, theme, singleModeUniverseId }` lido de `app_settings`.
- [ ] **Step 2:** `repos/stories.ts`: `listApproved(universeId)` (só `moderation_status='APPROVED'`, `deletedAt is null`, ordenado por `createdAt desc`), `getReadable(actor, id)` (APPROVED, ou dono/admin). `GET /api/v1/universes/:id/stories` e `GET /api/v1/stories/:id`.
- [ ] **Step 3:** Contratos no shared: `StoryListItemSchema` ({id,title,createdAt}), `StorySchema` ({id,title,content,...}). 
- [ ] **Step 4:** typecheck limpo. Commit: `feat(api): config + read endpoints (approved stories)`.

---

## Task 3: CRUD criativo (admin) + limite de universos

**Files:** `apps/api/src/repos/universes.ts` (estender), `characters.ts`, `themes.ts`, `storyArcs.ts`, `apps/api/src/routes/admin/creative.ts`, `apps/api/src/repos/plans.ts`/`usage.ts`

- [ ] **Step 1:** Rotas `POST /api/v1/universes`, `/universes/:id/characters`, `/themes`, `/arcs` sob `requireRole('ADMIN','MODERATOR')`. Validação zod.
- [ ] **Step 2:** Limite `max_universes` (RF-14): antes de criar universo, contar universos do criador (não deletados) vs. `plans.max_universes` do plano do usuário; exceder → `403` (ou `402` se preferir). Contabilizar em `usage_records` (`UNIVERSE_CREATED`).
- [ ] **Step 3:** typecheck limpo. Commit: `feat(api): admin creative CRUD + max_universes enforcement`.

---

## Task 4: Testes de integração

**Files:** `apps/api/src/routes/stories.test.ts`, `apps/api/src/routes/creative.test.ts`

- [ ] **Step 1:** leitura: lista só APPROVED (seedar 1 APPROVED + 1 PENDING → lista retorna 1); `GET /stories/:id` de história PENDING para não-dono → 404/403.
- [ ] **Step 2:** CRUD: usuário comum cria universo → 403 (modo SINGLE/role); admin cria → 201; criar além de `max_universes` (seedar plano com limite 1) → bloqueado.
- [ ] **Step 3:** `pnpm --filter "./apps/api" test` verde. Commit: `test(api): read + creative authorization tests`.

---

## Task 5: App — home (lista) + tela de leitura

**Files:** `apps/mobile/src/lib/api.ts` (read calls), `apps/mobile/src/app/index.tsx` (home → lista), `apps/mobile/src/app/story/[id].tsx` (leitura)

- [ ] **Step 1:** Cliente: `getConfig()`, `listStories(universeId)`, `getStory(id)` (com Bearer do AuthContext).
- [ ] **Step 2:** Home (`index.tsx`, pós-login+consent): busca config → lista histórias do `singleModeUniverseId` (título + tocar abre leitura). NativeWind, acessível.
- [ ] **Step 3:** Tela `story/[id].tsx`: renderiza título + corpo em parágrafos, tipografia grande/legível (RNF-06).
- [ ] **Step 4:** Gates headless: typecheck limpo; `expo export -p web` bundla; remover `dist/`. Commit: `feat(mobile): SINGLE-mode home story list + reading screen`.

---

## Verificação final WP3
- [ ] `pnpm ci:local` verde (migrate + seed + testes de leitura/CRUD).
- [ ] Headless: login (admin ou user) → `GET /config` → `GET /universes/:id/stories` retorna a história seedada → `GET /stories/:id` retorna o conteúdo.

**Done:** modo SINGLE navegável (login → lista → ler história seedada). Pronto p/ WP4 (gerar histórias de verdade).

## Self-Review
- Modo lido do banco (`app_settings`), não do build. ✓ · Leitura só APPROVED (testado). ✓
- CRUD restrito a admin + `max_universes` (testado). ✓ · Fixture APPROVED permite testar leitura sem WP4. ✓
