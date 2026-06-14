# StoryGen Engine — Demo (SINGLE + MULTI)

App de histórias infantis geradas por IA (Claude via gateway OmniRoute). Dois modos rodando ao mesmo tempo, persistentes (docker-compose, `restart: unless-stopped`).

## Como testar

| Modo | URL | Login |
|---|---|---|
| **SINGLE** ("Histórias da Gigi") | http://localhost:8080 | `admin@storygen.dev` / `admin123` |
| **MULTI** ("Meu Universo") | http://localhost:8082 | **cadastre uma conta nova** |

> Se `localhost` não abrir no navegador do Windows, use o IP do WSL: **http://192.168.2.2:8080** e **http://192.168.2.2:8082**. (A API é servida no **mesmo endereço** do site via proxy, então funciona pelos dois.)

### Fluxo SINGLE (universo fixo)
1. Abre `:8080` → login com o admin acima.
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
# status
docker compose -f docker-compose.demo.yml ps
# subir / reiniciar (se algo cair ou após reboot)
docker compose -f docker-compose.demo.yml up -d
# logs da API
docker compose -f docker-compose.demo.yml logs -f api
# parar tudo
docker compose -f docker-compose.demo.yml down
```

Portas: web SINGLE `8080`, web MULTI `8082`, API `3000`, Postgres (interno ao compose).

## Arquitetura (resumo)
- **app** Expo Router (web) → **API Fastify** (`apps/api`) → **Postgres** (Drizzle ORM). O app nunca toca o banco direto.
- Auth própria (argon2 + JWT), autorização na camada de aplicação (sem Supabase, sem RLS).
- Modo (SINGLE/MULTI) resolvido por `app_slug` no banco (`app_settings`), não pelo build.
- IA: adapter de provedor (ADR-04). Primário = **OmniRoute → Claude** (`cc/claude-haiku-4-5`); **stub offline** como fallback. Chave só em `apps/api/.env` (gitignored).
- nginx serve o web estático e faz proxy `/api` → API (mesma origem) — resiliente ao forwarding do WSL.

## Trocar o modelo do Claude
Edita `apps/api/.env` → `AI_MODEL=cc/claude-sonnet-4-6` (prosa melhor, mais lento) e `docker compose -f docker-compose.demo.yml up -d --build api`.

## Status do produto
Pronto até o **WP4** (núcleo): auth, consentimento, modos SINGLE/MULTI, CRUD criativo, geração por IA com quota/moderação, leitura. Pendente: WP5 billing real (RevenueCat), WP6 painel admin, WP7 observabilidade/LGPD-erasure. Tudo na branch `feat/wp0-foundation` (não mesclada).
