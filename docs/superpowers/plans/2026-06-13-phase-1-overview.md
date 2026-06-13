# StoryGen Engine — Fase 1 (MVP modo SINGLE): Visão de Implementação

> **For agentic workers:** Este é o **plano-mãe** da Fase 1. Ele NÃO é executável diretamente — decompõe a Fase 1 em work packages (WP). Cada WP tem (ou terá) seu próprio plano executável em `docs/superpowers/plans/`. Implemente um WP por vez com `superpowers:subagent-driven-development` ou `superpowers:executing-plans`.
>
> **v2 (2026-06-13):** revisado por painel adversarial (5 lentes). Correções principais: quota 100% dentro do WP4; gate de assinatura/consentimento testado via fixture seedado; modo SINGLE aplicado por valor visível ao banco (não pelo `APP_MODE` de build); WP7 dividido em WP7a/WP7b; NFRs Fase-1 com dono explícito; tabela `health` de smoke removida em migration própria no WP1.

**Goal:** Entregar o MVP modo SINGLE do SDD v2.0: uma história infantil gerada por IA, moderada, e lida de ponta a ponta nas 3 plataformas, com quota/billing, sob RLS e consentimento parental.

**Architecture:** Monorepo pnpm. App Expo Router (`apps/mobile`) consome Supabase (Postgres+RLS, Auth, Storage, Edge Functions). Schemas de validação (zod) e tipos do banco vivem em `packages/shared`, importados tanto pelo app (Node/Metro) quanto pelas Edge Functions (Deno, via import map) — contrato único. Backend de IA é uma Edge Function com adapter de provedor configurável em banco. Billing via RevenueCat. Tudo versionado em migrations SQL com suíte de testes RLS (pgTAP) rodando em CI.

**Tech Stack:** pnpm workspaces · Expo Router + React Native + NativeWind · TypeScript · Supabase (CLI local + Docker) · Deno (edge) · zod · pgTAP · RevenueCat · GitHub Actions.

**Referência de spec:** [sdd-plan-project.md](../../../sdd-plan-project.md) (SDD v2.0).

---

## Princípios transversais (valem para todos os WPs)

- **TDD onde há lógica**, gate de verificação onde é infra/scaffold. Testes reais: zod (vitest), RLS (pgTAP), edge functions (Deno test), app (jest-expo + Maestro nos fluxos críticos).
- **Migrations imutáveis**: nunca editar uma migration já aplicada/commitada; criar nova (inclusive para *remover* a tabela `health` de smoke — ver WP1).
- **Segredos nunca no cliente nem no git** (ADR-07): `.env.example` versionado; valores reais em `.env` (gitignored) e em Supabase Vault / secrets das functions.
- **Toda escrita sensível** (quota `usage_records`, billing, `moderation_status`) só via Edge Function com service role — nunca pelo cliente (Seção 6.4 do SDD).
- **Strings de UI externalizadas desde a primeira tela** (RNF-07): a camada i18n (pt-BR) é montada no WP2 e toda WP de UI (WP2/WP3/WP6) a usa — sem texto hardcoded.
- **RLS não basta estar habilitado**: as suítes pgTAP afirmam tanto RLS habilitado quanto que a persona errada (estranho/anônimo) é **negada** — habilitar RLS com `using(true)` não conta como protegido.
- **Modo SINGLE/MULTI no banco**: políticas RLS NÃO enxergam o `APP_MODE` de build do app. O modo efetivo é lido de `app_settings` (por `app_slug`); políticas e checagens server-side usam esse valor, não o env do cliente.
- **Commits frequentes**, um por step verde.

## Decisões de layout (locked)

```
/
├─ apps/mobile/                 # Expo Router app (package próprio)
├─ packages/shared/             # @storygen/shared: schemas zod + database.types.ts (gerado)
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/               # DDL + RLS, ordenadas por timestamp
│  ├─ seed.sql                  # dados determinísticos aplicados por `db reset`
│  ├─ functions/                # Edge Functions (Deno): story-generate, billing-webhook, lgpd-erasure
│  ├─ functions/import_map.json # mapeia "zod" -> npm:zod p/ reuso de packages/shared
│  └─ tests/                    # pgTAP (.sql) — suíte de RLS
├─ eslint.config.js             # flat config (eslint 9)
├─ .github/workflows/ci.yml
├─ pnpm-workspace.yaml          # packages + nodeLinker: hoisted
├─ package.json                 # root: scripts + devDeps
└─ tsconfig.base.json
```

Justificativa do monorepo (vs. app único): o SDD compartilha contratos entre app e edge (payloads de API, `PromptContextInput`, enums de domínio). Um pacote `shared` único elimina drift. O custo (config Metro para monorepo + import map Deno) é pago uma vez no WP0.

---

## Work Packages

Legenda de status: ⬜ não iniciado · 🔵 plano escrito · ✅ concluído.

### ⬜ WP0 — Fundação & tooling  → **plano executável: [2026-06-13-wp0-foundation.md](2026-06-13-wp0-foundation.md)**
Monorepo pnpm; app Expo Router bootando na web; `packages/shared` com schema zod testado; Supabase local (Docker) com migration smoke + `db reset` + geração de tipos; pgTAP rodando; client Supabase no app lendo do banco local; CI verde.
**Done quando:** `pnpm ci:local` (typecheck do workspace incl. app + lint flat-config + testes shared + `supabase db reset` + `supabase test db`) passa, e o app exibe um dado vindo do Postgres local.
**Depende de:** nada.

### ⬜ WP1 — Modelo de dados completo + RLS
Traduzir todo o DDL da Seção 6.3 do SDD em migrations ordenadas (extensões → tabelas núcleo → domínio criativo → IA → governança → app_settings). Migration dedicada que **remove a tabela `health`** de smoke do WP0 (`drop table public.health cascade`). Triggers `set_updated_at`. Habilitar RLS em todas as tabelas com as políticas da Seção 6.4. Suíte pgTAP que valida cada política com 4 personas (dono, estranho, admin, anônimo), afirmando **acesso do dono E negação do estranho/anônimo**. Gerar `database.types.ts` em `packages/shared`.
**Escopo por fase (DDL presente ≠ política funcional Fase-1):** `collaborations` é **Fase 3** e `ratings`/`notifications` são **Fase 2** — criadas como schema apenas, com RLS restritiva mínima (negar tudo a não-admin), sem fluxo funcional na Fase 1.
**Done quando:** todas as tabelas existem; RLS habilitado em 100% delas; tabela `health` não existe mais (assert pgTAP); suíte pgTAP cobre cada política Fase-1 (dono lê/escreve; estranho/anônimo negados; `stories` public só visível com `moderation_status='APPROVED'`); guard de CI falha se alguma política usar `USING (true)` para `anon`/`authenticated` em tabela não-pública; tudo verde em `supabase test db`.
**Depende de:** WP0.
**Cobre SDD:** Seção 6 inteira (DDL); Seção 6.4 (RLS Fase-1).

### ⬜ WP2 — Auth + consentimento parental + perfis infantis
Supabase Auth (e-mail/senha + Apple Sign-In no iOS — RF-01). Trigger que cria linha em `users` ao registrar (`auth_id`). Fluxo de consentimento parental (RF-02): tela-gate que bloqueia o **uso do app** até `consent_records` ter `PARENTAL_DATA` granted na versão vigente. CRUD de `child_profiles` (RF-03) sob RLS `guardian_id = auth.uid()`. RBAC via claim no JWT espelhando `users.role`. Camada i18n (pt-BR) montada aqui e usada por todas as telas (RNF-07).
**Done quando:** registro (e-mail/senha) → consentimento → criar perfil infantil funciona; **fluxo Apple Sign-In no iOS** demonstrado (RF-01); sem consentimento, o **gate de UI bloqueia o app** (o bloqueio da *geração* é verificado no WP4, onde o endpoint existe); testes RLS de `child_profiles` verdes (dono acessa, estranho negado); teste e2e (Maestro) do gate; nenhuma string de UI hardcoded.
**Depende de:** WP1.
**Cobre SDD:** RF-01..04, RNF-07, Seção 11.1 (consentimento). *(RF-05 conta dependente = Fase 2.)*

### ⬜ WP3 — Domínio criativo (CRUD) + UX de leitura (SINGLE) + limite de universos
CRUD (PostgREST/edge) de universos, personagens, temas, arcos — restrito a ADMIN/MODERATOR no modo SINGLE. **Enforcement do modo no banco**: políticas leem o modo de `app_settings` (por `app_slug`); `app_settings.single_mode_universe_id` aponta o universo fixo. **Limite `plans.max_universes` (parte de RF-14)**: criação de universo bloqueada acima do limite do plano, contabilizada/checada server-side. UX de leitura infantil: lista de histórias do universo fixo + tela de leitura (tipografia escalável, acessível — RNF-06) com **orçamento de latência de leitura p95 ≤ 800 ms (RNF-02)**. Upload de imagem de personagem (Storage). **Fixture seedado** de uma `stories` com `moderation_status='APPROVED'` para testar a tela de leitura sem depender do WP4.
**Done quando:** admin cria universo/personagem/tema/arco; criar universo além de `max_universes` é negado; usuário final em modo SINGLE vê só leitura (verificado por RLS contra o modo em `app_settings`); tela de leitura renderiza a história APPROVED seedada; leitura dentro do orçamento RNF-02 (medido).
**Depende de:** WP1, WP2.
**Cobre SDD:** RF-10..13, RF-14 (parcial: `max_universes`), RF-46, RNF-02, RNF-06, Seção 10.

### ⬜ WP4 — Pipeline de geração de IA + quota (endpoint autocontido)
Edge Function `story-generate` (Seção 8): valida **consentimento** (parental granted) + **quota** + **assinatura** → sanitiza `user_guidance` (8.2) → coleta contexto clima/horário (OpenWeatherMap + cache 30min, fallback determinístico por seed) → monta prompt do `prompt_templates` ativo → chama provedor via adapter (`ai_providers`, structured output JSON, retry≤2, fallback) → **gate de moderação** (8.4) → grava `stories` (incl. snapshot `user_guidance`) + atualiza `story_arcs.summary` (lock otimista `version`) + `usage_records` + custo. **Quota 100% aqui** (RF-14 stories): lê `usage_records` do mês vs. `plans.max_stories_per_month`, retorna `402 QUOTA_EXCEEDED`, e só incrementa uso em sucesso. **Gate de assinatura testado contra `subscriptions` seedado** (o webhook real chega no WP5). Editor de prompt (`prompt_templates`) e provedores (`ai_providers`) seedados. **RNF-01**: latência de geração p95 ≤ 25 s + UI de progresso no app.
**Done quando:** `POST /stories/generate` retorna 201 com história APPROVED (assinatura ativa via fixture seedado); reprovação na moderação devolve 422 sem consumir quota; exceder `max_stories_per_month` devolve 402 sem gerar; sem consentimento → bloqueado; arco contínuo respeita summary; corpus adversarial de moderação 100% bloqueado (regressão); p95 ≤ 25 s medido; UI de progresso presente.
**Depende de:** WP1, WP2, WP3.
**Cobre SDD:** RF-20..25, RF-14 (stories), RNF-01, Seção 7.2, Seção 8 inteira.

### ⬜ WP5 — Billing (RevenueCat) — sincronização de assinatura
SDK RevenueCat no app (IAP iOS/Android, Stripe web). Edge Function `billing-webhook` (assinada) sincroniza `subscriptions` (estado canônico). Máquina de estados `ACTIVE/PAST_DUE/CANCELED/EXPIRED` + grace period (RF-51). Mapeamento plano→entitlement RevenueCat. Tela de gestão aponta para o canal de origem (RF-52). **Não** redefine quota (já no WP4) — apenas alimenta `subscriptions` que o WP4 consome.
**Done quando:** compra sandbox ativa assinatura via webhook → `subscriptions` ACTIVE → WP4 passa a gerar; cancelamento/expiração transiciona estado e (após grace) rebaixa limites; máquina de estados testada; tela de gestão abre o canal correto.
**Depende de:** WP1, WP4.
**Cobre SDD:** RF-50..52, Seção 8.5 (rate limit de geração por plano), mapeamento de entitlement de RF-40.

### ⬜ WP6 — Painel administrativo
Telas admin (web-first via Expo Web): **CRUD de planos (RF-40)**, usuários (suspensão/papéis), editor de `prompt_templates` (versionamento/preview/rollback — RF-42), `ai_providers` (RF-43), fila de `reports` com ações (RF-44), `app_settings` (tema/logo/flags/modo — RF-46), visualização de `audit_logs`, **painel LGPD (RF-45)**: lista requisições de exclusão/anonimização, status de execução e logs de conformidade (dispara a função do WP7b). Toda ação admin grava em `audit_logs`.
**Notificações:** entrega de `notifications` (ex.: MODERATION_ACTION ao usuário) está **fora do escopo Fase-1** (a tabela existe; a maioria dos tipos serve Fase 2/3). WP6 só registra a ação e audita.
**Done quando:** CRUD de prompt com versionamento/rollback funciona (verificável só com WP1); admin resolve uma denúncia e a ação fica auditada; painel LGPD lista e dispara uma requisição. *(A verificação "a próxima geração usa o novo template ativo" é e2e e exige WP4 — listada como item dependente de WP4.)*
**Depende de:** WP1 (CRUD/versionamento). Item e2e do template ativo: **+WP4**.
**Cobre SDD:** RF-40 (CRUD), RF-42..46, Seção 8.4 (camada humana).

### ⬜ WP7a — Observabilidade & hardening
Sentry (app + edge), logs estruturados com `request_id`, dashboard de custo de geração (RNF-05). Rate limits por usuário/plano (RNF-04). SLO de disponibilidade 99,5%/mês + monitoração (RNF-03). Backups diários + **teste de restore documentado e executado uma vez em staging** (RNF-09).
**Done quando:** Sentry recebe um erro de teste (app e edge); logs carregam `request_id`; rate limit retorna 429 ao exceder; SLO/monitor configurado; restore de backup executado em staging com sucesso.
**Depende de:** WP1 (pode iniciar cedo; rate limit de geração integra-se ao WP4).
**Cobre SDD:** RNF-03/04/05/09.

### ⬜ WP7b — LGPD-erasure de conteúdo
Edge Function `lgpd-erasure` (Seção 11.2): soft-delete em cascata + anonimização de `characters` E de `stories.content` via snapshot `character_names` + **purge de `prompt_used` e do snapshot `user_guidance`** (coluna adicionada à DDL de `stories`) + hash de e-mail + `audit_logs` evento `LGPD_ERASURE`. Job de retenção (exclusão física pós-período).
**Done quando:** `DELETE /users/:id` anonimiza inclusive o texto das histórias — **teste afirma que nenhum nome de personagem sobrevive em `stories.content` e nenhum texto de `user_guidance` sobrevive em `prompt_used`**; evento `LGPD_ERASURE` auditado; job de retenção testado.
**Depende de:** WP1, WP2, WP3, WP4.
**Cobre SDD:** Seção 11 inteira.

---

## Grafo de dependências

```
WP0 ──► WP1 ──┬──► WP2 ──► WP3 ──► WP4 ──► WP5
              │                      │
              │                      └──► WP7b
              ├──► WP6 (CRUD; item e2e do template requer WP4)
              └──► WP7a (observabilidade; rate-limit de geração integra no WP4)
```

Caminho crítico: WP0 → WP1 → WP2 → WP3 → WP4 → WP5. WP6 e WP7a paralelizam após WP1. WP7b fecha após WP4.

## Critério de saída da Fase 1 (do SDD §13)

História gerada, moderada e lida ponta-a-ponta nas 3 plataformas; quota e billing funcionando; **suíte RLS (pgTAP) e corpus de moderação verdes em CI**; gates de NFR Fase-1 atendidos (RNF-01 p95 geração, RNF-02 p95 leitura, RNF-03 SLO). Quando WP0–WP7b estiverem ✅ e esse pipeline de CI passar, a Fase 1 está concluída.

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
