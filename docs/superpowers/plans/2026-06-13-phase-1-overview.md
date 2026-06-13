# StoryGen Engine — Fase 1 (MVP modo SINGLE): Visão de Implementação

> **For agentic workers:** Plano-mãe da Fase 1. NÃO é executável diretamente — decompõe em work packages (WP). Cada WP tem (ou terá) seu plano executável em `docs/superpowers/plans/`. Implemente um WP por vez com `superpowers:subagent-driven-development` ou `superpowers:executing-plans`.
>
> **v3 (2026-06-13) — PIVÔ SEM SUPABASE.** Stack agora: **PostgreSQL puro (Docker em dev/test) + API Fastify própria (`apps/api`) + Drizzle ORM + auth própria (argon2 + JWT)**. Autorização na camada de aplicação (sem RLS/pgTAP). Sem supabase-js, sem Supabase CLI/Auth/Edge/Storage. Ver [[no-supabase]] e SDD v2.1 (ADR-01/07/08).

**Goal:** Entregar o MVP modo SINGLE do SDD v2.1: uma história infantil gerada por IA, moderada, e lida de ponta a ponta nas 3 plataformas, com quota/billing, autenticada e autorizada pela API.

**Architecture:** Monorepo pnpm. App **Expo Router** (`apps/mobile`) consome uma **API Fastify** (`apps/api`) por REST — nunca toca o banco direto. A API usa **Drizzle ORM** sobre **PostgreSQL** (Docker em dev/test/CI; instância gerenciada em prod), emite **JWT** (auth própria, argon2), e concentra auth, autorização, pipeline de IA, webhooks de billing e LGPD. Contratos (zod) e tipos compartilhados vivem em `packages/shared`, usados por app e API.

**Tech Stack:** pnpm workspaces · Expo Router + React Native + NativeWind · **Fastify** · **Drizzle ORM + drizzle-kit** · **PostgreSQL (Docker)** · zod · vitest · argon2 + jsonwebtoken · RevenueCat · GitHub Actions.

**Referência de spec:** [sdd-plan-project.md](../../../sdd-plan-project.md) (SDD v2.1).

---

## Princípios transversais (valem para todos os WPs)

- **O app nunca fala com o banco** — só com a API Fastify. Toda autorização é na API (queries escopadas por `user_id` do JWT).
- **TDD onde há lógica**, gate de verificação onde é infra. Testes reais: zod (vitest), **rotas/serviços da API (vitest de integração contra Postgres de teste em Docker)**, app (jest-expo + Maestro nos fluxos críticos).
- **Migrations imutáveis** geradas por `drizzle-kit generate`; aplicadas por `drizzle-kit migrate`. Nunca editar migration já aplicada/commitada — gerar nova.
- **Segredos só no servidor** (ADR-07): `DATABASE_URL`, segredos de JWT, API keys vivem no `.env` da API (gitignored) / secret manager. `.env.example` versionado.
- **Escrita sensível** (quota `usage_records`, billing, `moderation_status`) só em serviços internos da API — nunca rota de escrita do cliente.
- **Strings de UI externalizadas desde a primeira tela** (RNF-07): camada i18n (pt-BR) montada no WP2; toda WP de UI a usa.
- **Isolamento multi-tenant é testado** (não presumido): cada WP com dados de usuário inclui teste de integração com 4 personas (dono, estranho, admin, anônimo) provando que A não acessa dados de B via API.
- **Postgres é descartável em dev/test**: `docker compose up -d postgres`; um banco de teste efêmero por suíte. RLS pode ser defesa-em-profundidade futura, não é requisito Fase 1.
- **Commits frequentes**, um por step verde.

## Decisões de layout (locked)

```
/
├─ apps/mobile/                 # Expo Router app (package próprio)
├─ apps/api/                    # Fastify API (package próprio)
│  ├─ src/db/schema.ts          # Drizzle schema (fonte dos tipos do banco)
│  ├─ src/routes/ · src/services/
│  ├─ drizzle/                  # migrations geradas por drizzle-kit
│  └─ drizzle.config.ts
├─ packages/shared/             # @storygen/shared: contratos zod + tipos (DTOs API)
├─ docker-compose.yml           # postgres (dev/test); minio (storage) entra na Fase 2
├─ eslint.config.js
├─ .github/workflows/ci.yml
├─ pnpm-workspace.yaml
├─ package.json
└─ tsconfig.base.json
```

Monorepo justifica-se: app e API compartilham contratos (payloads, enums de domínio) via `packages/shared`, eliminando drift.

---

## Work Packages

Legenda: ⬜ não iniciado · 🔵 plano escrito · ✅ concluído.

### ⬜ WP0 — Fundação & tooling  → **plano executável: [2026-06-13-wp0-foundation.md](2026-06-13-wp0-foundation.md)**
Monorepo pnpm; app Expo bootando; `packages/shared` com contrato zod testado; **Postgres via `docker-compose`**; **API Fastify (`apps/api`)** com Drizzle conectado ao Postgres, primeira migration e rota `GET /health` que lê o banco; teste de integração vitest da rota contra Postgres de teste; app consumindo `/health` da API; NativeWind; CI verde.
**Done quando:** `pnpm ci:local` (typecheck do workspace + lint + testes shared + **subir Postgres + drizzle migrate + vitest de integração da API**) passa; `GET /health` retorna status lido do Postgres; app compila consumindo a API.
**Depende de:** nada.

### ⬜ WP1 — Modelo de dados (Drizzle) + harness de autorização
Traduzir todo o DDL da Seção 6.3 do SDD para o **schema Drizzle** (`apps/api/src/db/schema.ts`): núcleo de contas (incl. `password_hash`, `refresh_tokens`), domínio criativo, IA, governança, `app_settings`. Gerar e aplicar migrations. Remover a tabela `health` de smoke do WP0 (nova migration). Repositórios/queries-base **sempre escopadas por usuário**. Harness de teste de integração (Postgres efêmero) com as 4 personas.
**Escopo por fase:** `collaborations` (Fase 3) e `ratings`/`notifications` (Fase 2) entram como schema apenas, sem rotas funcionais na Fase 1.
**Done quando:** todas as tabelas existem via migrations; `drizzle-kit migrate` aplica limpo num banco novo; tabela `health` removida; testes de integração provam isolamento por usuário nas queries-base (dono acessa, estranho é negado); CI verde.
**Depende de:** WP0.
**Cobre SDD:** Seção 6 (schema Drizzle), Seção 6.4 (autorização de app).

### ⬜ WP2 — Auth (argon2 + JWT) + consentimento parental + perfis infantis
Rotas da API: registro (e-mail/senha, hash argon2), login (emite access+refresh JWT), refresh com rotação (`refresh_tokens`), logout. Apple Sign-In no iOS (RF-01). Middleware de auth/RBAC (claims `USER/MODERATOR/ADMIN`). Fluxo de consentimento parental (RF-02): gate que bloqueia uso do app até `consent_records` ter `PARENTAL_DATA` granted na versão vigente. CRUD de `child_profiles` (RF-03) escopado por `guardian_id`. Camada i18n (pt-BR) montada aqui (RNF-07).
**Done quando:** registro→login→refresh funciona (JWT válidos, refresh rotaciona e revoga o antigo); senha nunca em claro (argon2); Apple Sign-In no iOS demonstrado; gate de consentimento bloqueia o app sem consentimento; CRUD de `child_profiles` isolado por responsável (teste de integração: estranho negado); nenhuma string de UI hardcoded.
**Depende de:** WP1.
**Cobre SDD:** RF-01..04, RNF-07, Seção 11.1, ADR-08. *(RF-05 conta dependente = Fase 2.)*

### ⬜ WP3 — Domínio criativo (CRUD na API) + UX de leitura (SINGLE) + limite de universos
Rotas CRUD de universos/personagens/temas/arcos — restritas a ADMIN/MODERATOR no modo SINGLE. **Modo lido de `app_settings`** (por `app_slug`); `single_mode_universe_id` aponta o universo fixo. Limite `plans.max_universes` (parte de RF-14) imposto na criação. UX de leitura infantil (lista + tela de leitura acessível, tipografia escalável — RNF-06) com orçamento p95 ≤ 800 ms (RNF-02). Upload de imagem de personagem via API (presigned URL para S3/MinIO; na Fase 1 pode ser disco local). Fixture seedado de uma `stories` `APPROVED` para testar leitura sem o WP4.
**Done quando:** admin cria universo/personagem/tema/arco; criar universo além de `max_universes` é negado pela API; usuário final em SINGLE só lê (autorização da API verificada por teste); tela de leitura renderiza a história APPROVED seedada; leitura dentro do RNF-02.
**Depende de:** WP1, WP2.
**Cobre SDD:** RF-10..13, RF-14 (universos), RF-46, RNF-02, RNF-06, Seção 10.

### ⬜ WP4 — Pipeline de geração de IA (serviço da API) + quota
Rota `POST /stories/generate` (Seção 8): valida **consentimento + quota + assinatura** → sanitiza `user_guidance` (8.2) → coleta contexto clima/horário (OpenWeatherMap + cache 30min, fallback determinístico por seed) → monta prompt do `prompt_templates` ativo → chama provedor via adapter (`ai_providers`, structured output JSON, retry≤2, fallback) → **gate de moderação** (8.4) → grava `stories` (incl. snapshot `user_guidance`) + atualiza `story_arcs.summary` (lock otimista `version`) + `usage_records` + custo. **Quota 100% aqui** (RF-14 stories): `usage_records` do mês vs. `plans.max_stories_per_month`, retorna `402`, só incrementa em sucesso. **Gate de assinatura testado contra `subscriptions` seedado** (webhook real no WP5). Editor de prompt e provedores seedados. RNF-01: p95 ≤ 25 s + UI de progresso.
**Done quando:** `POST /stories/generate` → 201 com história APPROVED (assinatura ativa via fixture); moderação reprovada → 422 sem consumir quota; exceder quota → 402 sem gerar; sem consentimento → bloqueado; arco contínuo respeita summary; corpus adversarial de moderação 100% bloqueado; p95 ≤ 25 s; UI de progresso.
**Depende de:** WP1, WP2, WP3.
**Cobre SDD:** RF-20..25, RF-14 (stories), RNF-01, Seção 7.2, Seção 8.

### ⬜ WP5 — Billing (RevenueCat) — sincronização de assinatura
SDK RevenueCat no app (IAP iOS/Android, Stripe web). Rota `POST /billing/webhook` (assinada) sincroniza `subscriptions`. Máquina de estados `ACTIVE/PAST_DUE/CANCELED/EXPIRED` + grace period (RF-51). Mapeamento plano→entitlement. Tela de gestão aponta para o canal de origem (RF-52). Não redefine quota (já no WP4) — só alimenta `subscriptions`.
**Done quando:** compra sandbox → webhook → `subscriptions` ACTIVE → WP4 gera; cancelamento/expiração transiciona e (após grace) rebaixa; máquina de estados testada; tela abre canal correto.
**Depende de:** WP1, WP4.
**Cobre SDD:** RF-50..52, Seção 8.5, mapeamento de entitlement de RF-40.

### ⬜ WP6 — Painel administrativo
Telas admin (web-first via Expo Web) + rotas `/admin/*`: CRUD de planos (RF-40), usuários (suspensão/papéis), editor de `prompt_templates` (versionamento/preview/rollback — RF-42), `ai_providers` (RF-43), fila de `reports` (RF-44), `app_settings` (tema/logo/flags/modo — RF-46), `audit_logs`, painel LGPD (RF-45). Toda ação admin grava `audit_logs`.
**Notificações:** entrega de `notifications` fora do escopo Fase-1.
**Done quando:** CRUD de prompt com versionamento/rollback; admin resolve denúncia auditada; painel LGPD dispara requisição. *(verificação e2e "próxima geração usa novo template" requer WP4.)*
**Depende de:** WP1 (CRUD/versionamento). Item e2e do template: +WP4.
**Cobre SDD:** RF-40 (CRUD), RF-42..46, Seção 8.4 (camada humana).

### ⬜ WP7a — Observabilidade & hardening
Sentry (app + API), logs estruturados com `request_id`, dashboard de custo de geração (RNF-05). Rate limits por usuário/plano (RNF-04). SLO 99,5%/mês + monitoração (RNF-03). Backups diários do Postgres + teste de restore em staging (RNF-09).
**Done quando:** Sentry recebe erro de teste (app e API); logs com `request_id`; rate limit → 429; SLO/monitor configurado; restore executado em staging.
**Depende de:** WP1.
**Cobre SDD:** RNF-03/04/05/09.

### ⬜ WP7b — LGPD-erasure de conteúdo
Serviço `lgpd-erasure` na API (Seção 11.2): soft-delete em cascata + anonimização de `characters` E de `stories.content` via snapshot `character_names` + purge de `prompt_used` e `user_guidance` + hash de e-mail + `audit_logs` evento `LGPD_ERASURE`. Job de retenção (exclusão física pós-período).
**Done quando:** `DELETE /users/:id` anonimiza inclusive o texto das histórias — teste afirma que nenhum nome de personagem sobrevive em `stories.content` nem texto de `user_guidance` em `prompt_used`; evento auditado; job de retenção testado.
**Depende de:** WP1, WP2, WP3, WP4.
**Cobre SDD:** Seção 11.

---

## Grafo de dependências

```
WP0 ──► WP1 ──┬──► WP2 ──► WP3 ──► WP4 ──► WP5
              │                      │
              │                      └──► WP7b
              ├──► WP6 (CRUD; item e2e do template requer WP4)
              └──► WP7a (observabilidade)
```

Caminho crítico: WP0 → WP1 → WP2 → WP3 → WP4 → WP5. WP6 e WP7a paralelizam após WP1. WP7b fecha após WP4.

## Critério de saída da Fase 1 (SDD §13)

História gerada, moderada e lida ponta-a-ponta nas 3 plataformas; quota e billing funcionando; **suíte de autorização (integração da API) e corpus de moderação verdes em CI**; NFRs Fase-1 (RNF-01 p95 geração, RNF-02 p95 leitura, RNF-03 SLO). WP0–WP7b ✅ + CI verde = Fase 1 concluída.

## Rastreabilidade de requisitos (dono único)

| Requisito | Dono | | Requisito | Dono |
|---|---|---|---|---|
| RF-01..04 | WP2 | | RF-40 (CRUD) | WP6 |
| RF-05 | Fase 2 | | RF-40 (entitlement) | WP5 |
| RF-10..13 | WP3 | | RF-42..44, RF-46 | WP6 |
| RF-14 (universos) | WP3 | | RF-45 (painel LGPD) | WP6 (dispara WP7b) |
| RF-14 (histórias) | WP4 | | RF-50..52 | WP5 |
| RF-20..25 | WP4 | | RNF-01 | WP4 |
| RF-30..33 | Fase 2/3 | | RNF-02 | WP3 |
| Seção 6 / 6.4 | WP1 | | RNF-03/04/05/09 | WP7a |
| Seção 11 | WP7b (+WP2 consentimento) | | RNF-06 | WP3 |
| Seção 8 | WP4 | | RNF-07 | WP2 |
| ADR-08 (auth) | WP2 | | | |
