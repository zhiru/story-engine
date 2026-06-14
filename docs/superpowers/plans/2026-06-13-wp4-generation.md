# WP4 — Pipeline de Geração de IA + Quota — Implementation Plan

> REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. WSL/quoting: [[git-via-wsl]] (`bash -lc`; git msg aspas simples). Postgres Docker 5433.

**Goal:** `POST /api/v1/stories/generate` ponta-a-ponta (Seção 8 do SDD): valida consentimento+quota+assinatura → sanitiza guidance → coleta contexto (clima/horário, fallback) → monta prompt do template ativo → chama provedor via **adapter** (stub determinístico, real plugável) → **gate de moderação** → grava `stories` APPROVED + atualiza `story_arcs.summary` + `usage_records` + custo. Quota (`402`), moderação reprovada (`422` sem consumir quota). App: botão "Gerar história" → progresso → abre a história nova.

**Architecture:** adapter de provedor selecionado de `ai_providers` (ADR-04, nenhum modelo hardcoded); provedor **`stub`** gera história infantil determinística a partir de universo/personagens/tema/clima — roda offline, sem API key. Moderação = blocklist PT no input (`user_guidance`) e no output. Quota lida/escrita só no serviço.

**Cobre:** RF-20..25, RF-14 (stories), Seção 7.2, Seção 8.

---

## Task 1: Seeds de IA + assinatura/consentimento do demo

**Files:** `apps/api/src/db/seed.ts` (estender)

- [ ] **Step 1:** Estender o seed idempotente com:
  - `ai_providers`: 1 linha `provider='stub'`, `model='stub-kids-v1'`, `is_active=true`, `fallback_order=0`.
  - `prompt_templates`: 1 linha ativa para esse provider, com o template de referência (SDD §8.6) incl. o bloco fixo de segurança; `variables` declarando as usadas.
  - garantir que o admin seedado tenha **consentimento** `PARENTAL_DATA` granted (versão vigente) e **assinatura ACTIVE** (já há plano/subscription do WP3 — confirmar `status='ACTIVE'` e `current_period_end` no futuro).
- [ ] **Step 2:** `pnpm db:seed` 2x (idempotente). Commit: `feat(api): seed stub ai provider + active prompt template + demo consent/subscription`.

---

## Task 2: Contexto + sanitização + prompt

**Files:** `apps/api/src/ai/context.ts`, `apps/api/src/ai/sanitize.ts`, `apps/api/src/ai/prompt.ts`, `packages/shared` (já tem `GenerateStoryInputSchema`)

- [ ] **Step 1:** `context.ts`: `getContext(geo?)` → `{ temperature, condition, currentTime }`. Sem API key (padrão): **fallback determinístico** por seed `(userId + data)` escolhe condição plausível + hora do dia. (Estrutura permite plugar OpenWeather depois.)
- [ ] **Step 2:** `sanitize.ts`: `sanitizeGuidance(s)` (trim, máx 500, remove marcação/instruções) + `containsBlocked(text)` (blocklist PT de termos inadequados a público infantil). 
- [ ] **Step 3:** `prompt.ts`: `assemblePrompt(template, vars)` substitui placeholders do `prompt_templates.template` ativo pelas variáveis (universo, personagens, tema, clima, narrative_type, previous_summary, user_guidance). Retorna a string final (`prompt_used`).
- [ ] **Step 4:** typecheck limpo. Commit: `feat(api): context capture, guidance sanitize/blocklist, prompt assembly`.

---

## Task 3: Adapter de provedor (stub) + moderação

**Files:** `apps/api/src/ai/provider.ts`, `apps/api/src/ai/stubProvider.ts`, `apps/api/src/ai/moderation.ts`

- [ ] **Step 1:** `provider.ts`: interface `AiProvider { generate(input): Promise<{ title: string; story_body: string; internal_summary_for_next_chapters: string }> }` + `getActiveProviders()` (de `ai_providers`, por `fallback_order`) + `resolveProvider(row)` (mapeia `provider` → implementação; `stub` → stubProvider; outros lançam "não implementado" por ora).
- [ ] **Step 2:** `stubProvider.ts`: gera história infantil **determinística mas variada** a partir de `{universe, characters, theme, weather, narrative_type, previous_summary, user_guidance, seed}`. Regras: o personagem `PRINCIPAL` lidera a resolução; integra clima/horário sutilmente; 4–6 parágrafos; se `CONTINUOUS`, termina com gancho. `internal_summary` = 3 linhas factuais. Varia por `seed` (derive de data+contador) p/ não repetir no mesmo dia.
- [ ] **Step 3:** `moderation.ts`: `moderateOutput(text)` → `{ ok: boolean, reason?: string }` (blocklist + heurística simples). Determinístico e testável.
- [ ] **Step 4:** Testes unitários: stub respeita PRINCIPAL e gancho em CONTINUOUS; `moderateOutput` bloqueia texto com termo proibido e aprova texto limpo; `containsBlocked` no input. Commit: `feat(api): stub ai provider + output moderation (with unit tests)`.

---

## Task 4: Serviço + rota `POST /stories/generate`

**Files:** `apps/api/src/services/generateStory.ts`, `apps/api/src/repos/usage.ts`, `apps/api/src/repos/storyArcs.ts`, `apps/api/src/repos/aiConfig.ts`, `apps/api/src/routes/generate.ts`, `app.ts`

- [ ] **Step 1:** `repos/usage.ts`: `countThisMonth(userId, metric)`, `record(userId, metric)`. `repos/storyArcs.ts`: `getById`, `updateSummary(id, summary, expectedVersion)` (lock otimista). `repos/aiConfig.ts`: lê template ativo + providers.
- [ ] **Step 2:** `services/generateStory.ts` (orquestra; recebe `actor` + input validado):
  1. `requireConsent` já garante consentimento (na rota). Checar **assinatura ACTIVE** do usuário → senão `403 NO_ACTIVE_SUBSCRIPTION`.
  2. **quota:** `countThisMonth(actor.id,'STORY_GENERATED')` vs `plans.max_stories_per_month` → exceder `402 QUOTA_EXCEEDED`.
  3. `sanitizeGuidance` + `containsBlocked(input.user_guidance)` → se bloqueado, `422 CONTENT_REJECTED` (sem consumir quota, audita).
  4. carrega universo+personagens+tema (+ arco/previous_summary se `story_arc_id`).
  5. `getContext(geo)`.
  6. `assemblePrompt(templateAtivo, vars)`.
  7. percorre providers ativos: `generate` com retry≤2; se erro, próximo provider; todos falham → `503 GENERATION_FAILED` (sem quota).
  8. `moderateOutput(story_body)`; se reprovado, **regenera 1x** com instrução reforçada; reprovado de novo → `422` (sem quota, audita).
  9. APROVADO: insere `stories` (APPROVED, `user_id`, `universe_id`, `prompt_template_id`, `prompt_used`, `user_guidance` snapshot, `character_names` snapshot, `metadata_weather`, `generation_cost`) + se CONTINUOUS atualiza `arc.summary` (lock otimista) + `usage.record` + `audit_logs`.
  10. retorna 201 com `{id,title,content,story_arc_id,metadata_weather}`.
- [ ] **Step 3:** `routes/generate.ts`: `POST /api/v1/stories/generate` sob `requireAuth`+`requireConsent`, valida `GenerateStoryInputSchema`, chama o serviço, mapeia erros para os códigos acima (envelope `{error:{code,message}}`).
- [ ] **Step 4:** typecheck limpo. Commit: `feat(api): POST /stories/generate pipeline (quota, context, moderation, persist)`.

---

## Task 5: Testes de integração da geração

**Files:** `apps/api/src/routes/generate.test.ts`

- [ ] **Step 1:** Seeds por teste (resetDb + helpers): user com consentimento + assinatura ACTIVE + plano; universo+personagens+tema; provider stub + template ativos.
- [ ] **Step 2:** Casos:
  - happy: `POST /stories/generate` → 201, história `APPROVED` persistida com `user_id`, `character_names`, `metadata_weather`; `usage_records` +1.
  - quota: plano `max_stories_per_month=1`, gerar 2x → 2º `402`, sem nova story.
  - moderação de input: `user_guidance` com termo proibido → `422`, quota não consumida.
  - sem assinatura → `403`.
  - CONTINUOUS: com `story_arc_id`, gera capítulo, `arc.summary` atualizado (version+1).
- [ ] **Step 3:** `pnpm --filter "./apps/api" test` verde. Commit: `test(api): story generation integration tests`.

---

## Task 6: App — botão "Gerar história"

**Files:** `apps/mobile/src/lib/api.ts` (`generateStory`), `apps/mobile/src/app/index.tsx` (botão + progresso)

- [ ] **Step 1:** `generateStory(input)` (POST com Bearer). 
- [ ] **Step 2:** Na home, botão "✨ Gerar nova história": ao tocar, mostra estado de progresso (spinner + texto), chama generate, em sucesso navega p/ `story/[id]` da nova história; em 402/422 mostra mensagem amigável. Atualiza a lista.
- [ ] **Step 3:** Gates headless: typecheck limpo; `expo export -p web` bundla; remover `dist/`. Commit: `feat(mobile): generate-story button with progress`.

---

## Verificação final WP4
- [ ] `pnpm ci:local` verde (inclui testes de geração).
- [ ] **Demo headless:** login (admin seedado) → `POST /api/v1/stories/generate {universe_id: <single>}` → 201 com história nova → `GET /stories/:id` mostra o conteúdo gerado. Repetir gera história diferente.

**Done:** geração funcional ponta-a-ponta (stub offline). **Demo de produto:** login → ver universo → gerar → ler. Pronto p/ plugar provedor LLM real (env) e WP5+.

## Self-Review
- Quota 100% no endpoint (402); moderação input+output (422 sem quota); assinatura checada (fixture). ✓
- Adapter sem modelo hardcoded; stub offline; provedor real plugável. ✓
- CONTINUOUS atualiza summary com lock otimista. ✓
