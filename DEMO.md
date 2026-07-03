# StoryGen Engine — Demo (SINGLE + MULTI)

App de histórias infantis geradas por IA (Claude via gateway OmniRoute). Dois modos rodando ao mesmo tempo, persistentes (docker-compose, `restart: unless-stopped`).

## Como testar

| Modo | URL | Login |
|---|---|---|
| **SINGLE** ("Histórias da Gigi") | http://localhost:8081 | `admin@storygen.dev` / `admin123` |
| **MULTI** ("Meu Universo") | http://localhost:8082 | **cadastre uma conta nova** |

> Se `localhost` não abrir no navegador do Windows, use o IP do WSL: **http://192.168.2.2:8081** e **http://192.168.2.2:8082**. (A API é servida no **mesmo endereço** do site via proxy, então funciona pelos dois.)

### Fluxo SINGLE (universo fixo)
1. Abre `:8081` → login com o admin acima.
2. Concede o consentimento (gate parental LGPD).
3. Vê a história seedada "Gigi e o Bolo de Aniversário" → toca pra ler.
4. **"Gerar nova historia"** → gera do Claude (~13s) e abre a leitura. Gera de novo = história diferente.

### Fluxo MULTI (cada um cria o seu)
1. Abre `:8082` → **Criar conta** (e-mail + senha). Ganha um plano *trial* automático.
2. Concede consentimento.
3. **"Criar universo"** → título, descrição, 1 personagem, 1 tema.
4. Entra no universo → **"Gerar nova historia"** → Claude gera no SEU universo.
5. Cada conta só vê e gera nos próprios universos (isolado).

## Operação

```bash
# (dentro do WSL, na raiz do projeto)

# 1) build dos dois web (PESADO, só na 1ª vez ou após mudar o app) — ~2-3 min, CPU alta
bash scripts/build-demo-web.sh

# 2) subir o stack (LEVE — usa imagem da API + web já buildados; idle ~0% CPU)
docker compose -f docker-compose.demo.yml up -d

# status / logs / parar
docker compose -f docker-compose.demo.yml ps
docker compose -f docker-compose.demo.yml logs -f api
docker compose -f docker-compose.demo.yml down      # libera recursos (mantém o volume do banco)
```

> **Recursos:** o stack **parado custa ~0%**. O peso é o `build-demo-web.sh` (Metro empacotando 2 bundles) — roda uma vez. Depois disso, `up -d` é leve.

Portas: web SINGLE `8081`, web MULTI `8082`, API `3000`, Postgres (interno ao compose).

## IA (Claude) e fallback
A geração usa o gateway **OmniRoute → Claude**. Se o gateway estiver fora (ex.: `502`), o app cai automaticamente num **gerador offline (stub)** — a história sai mais simples, mas o app **não quebra**. Quando o gateway volta, as próximas histórias saem do Claude de novo. (Comportamento por design — adapter de provedor, ADR-04.)

## Arquitetura (resumo)
- **app** Expo Router (web) → **API Fastify** (`apps/api`) → **Postgres** (Drizzle ORM). O app nunca toca o banco direto.
- Auth própria (argon2 + JWT), autorização na camada de aplicação (sem Supabase, sem RLS).
- Modo (SINGLE/MULTI) resolvido por `app_slug` no banco (`app_settings`), não pelo build.
- IA: adapter de provedor (ADR-04). Primário = **OmniRoute → Claude** (`cc/claude-haiku-4-5`); **stub offline** como fallback. Chave só em `apps/api/.env` (gitignored).
- nginx serve o web estático; o app chama a API em `localhost:3000` (publicada pelo Docker Desktop no host). nginx também expõe proxy `/api` como alternativa.

## Trocar o modelo do Claude
Edita `apps/api/.env` → `AI_MODEL=cc/claude-sonnet-4-6` (prosa melhor, mais lento) e `docker compose -f docker-compose.demo.yml up -d --build api`.

## Status do produto
Fase 1 do SDD **completa** na branch `feat/wp0-foundation` (não mesclada). Cobertura vs SDD:

- **Auth/contas:** e-mail+senha, JWT access/refresh com rotação, RBAC (USER/MODERATOR/ADMIN), consentimento parental derivado do servidor (`/me`), suspensão de conta imposta em toda requisição.
- **Domínio criativo:** CRUD completo de universos (com visibilidade + localização), personagens, temas e arcos; modos SINGLE/MULTI por `app_slug`; blocklist infantil na criação/edição.
- **Geração por IA (§8):** contexto de clima real (OpenWeatherMap + cache 30 min + fallback determinístico), registro de context providers, saída estruturada JSON, retry+backoff e fallback de provedor, moderação de saída com regeneração reforçada, persistência transacional com lock otimista do arco, custo de tokens, corpus adversarial anti-injection.
- **Billing (§7/RF-50..52):** webhook RevenueCat (máquina de estados ACTIVE/PAST_DUE/CANCELED/EXPIRED + carência), idempotência, `GET /me/subscription` e `/me/usage`.
- **Descoberta/comunidade:** feed `/discovery` paginado por cursor, avaliações 1–5, denúncia de conteúdo, moderação.
- **Admin (RF-40..46):** planos, usuários, editor de prompts (com bloco de segurança obrigatório), provedores de IA, fila de moderação, `app_settings`/tema, auditoria, painel LGPD.
- **LGPD/infra:** erasure com anonimização (`[ANONIMIZADO_<hash>]`) e purga opcional de histórias privadas, job de retenção FK-safe, backups (sidecar `pg_dump`), integridade de banco (CHECKs, índices parciais, trigger `set_updated_at`), Sentry + logs com `request_id`.
- **App (Expo Web/PWA):** login, consentimento, perfis infantis, geração com tema/arco/perfil/geo, leitura, denúncia, assinatura, descoberta+avaliação, gestão MULTI (editar/excluir universo, personagens, temas), tema remoto white-label (logo/cor/nome via `app_settings`), 8 telas admin, tudo em pt-BR.

Contrato de erro padronizado `{ error: { code, message, request_id } }`, rate limit por IP (global) + por usuário (geração), paginação por cursor.

### Variáveis de ambiente novas (`apps/api/.env`, todas opcionais)
- `REVENUECAT_WEBHOOK_TOKEN` — auth do webhook de billing (vazio ⇒ webhook responde 503).
- `GRACE_PERIOD_DAYS` (padrão 3) — carência em `BILLING_ISSUE`.
- `OPENWEATHER_API_KEY` — clima real; vazio ⇒ fallback determinístico (o app não quebra).

Nenhuma delas é obrigatória para subir o stack da demo.
