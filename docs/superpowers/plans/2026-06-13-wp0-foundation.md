# WP0 — Fundação & Tooling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` ou `superpowers:executing-plans`. Steps usam checkbox (`- [ ]`).
>
> **v3 (2026-06-13) — PIVÔ SEM SUPABASE.** Stack: **Postgres (Docker) + Fastify (`apps/api`) + Drizzle ORM + vitest de integração**. Sem supabase-js/CLI/migrations-CLI/pgTAP. As partes stack-agnósticas (monorepo pnpm, app Expo, `packages/shared`, NativeWind) **já foram implementadas** na branch `feat/wp0-foundation` e permanecem — este plano marca o que **fica** vs. o que é **substituído**.

**Goal:** Provar o esqueleto: monorepo pnpm; app Expo; `packages/shared` (contratos zod); **Postgres em Docker**; **API Fastify** com **Drizzle** conectado ao Postgres, primeira migration e `GET /health` lendo o banco; teste de integração da rota; app consumindo a API; CI verde.

**Architecture:** `apps/api` (Fastify) é o único que toca o Postgres (via Drizzle). `apps/mobile` chama a API por REST. `packages/shared` guarda contratos zod/DTO usados pelos dois. Postgres roda em `docker-compose` para dev/test/CI.

**Tech Stack:** pnpm 10 · Node 22 · TypeScript · Expo Router · NativeWind v4 · **Fastify · Drizzle ORM + drizzle-kit · postgres.js · PostgreSQL 17 (Docker)** · zod · vitest · ESLint 9.

**Ambiente:** node 22.22.2, pnpm 10.22.0, Docker 29.5.2 (rodar tudo no WSL Ubuntu; ver [[git-via-wsl]]). cwd = raiz do repo.

> **Execução no WSL:** comandos de shell rodam via `wsl.exe -d ubuntu --cd /home/aireset/projetos/docker/story-engine -- bash -lc "<cmd>"` (a tool Bash roda no Windows e não acessa o path). Files via UNC `\\wsl.localhost\ubuntu\...`.

---

## Status das tarefas (pivô)

| Task | Conteúdo | Estado |
|---|---|---|
| 0 | Workspace pnpm + tooling | **Feito** — só remover devDep `supabase`/`onlyBuiltDependencies` e ajustar scripts (Docker+Drizzle) |
| 1 | `packages/shared` (zod) | **Feito** — remover `database.types.ts` (era do supabase); manter contratos zod |
| 2 | App Expo (`apps/mobile`) | **Feito** — remover `@supabase/supabase-js`; app passa a chamar a API |
| 3 | White-label `app.config.ts` | **Feito** — trocar `extra.supabaseUrl/anonKey` por `extra.apiUrl` |
| 4 | **Postgres (Docker) + API Fastify + Drizzle** | **Novo** (substitui o antigo "supabase local") |
| 5 | **Migration Drizzle + `GET /health` + teste de integração** | **Novo** (substitui pgTAP) |
| 6 | App consome `/health` da API | **Novo** (substitui client supabase) |
| 7 | CI (docker postgres + drizzle migrate + vitest) | **Novo** (substitui supabase no CI) |
| 8 | NativeWind v4 | **Feito** — sem mudança |

---

## Task 0 (ajuste): remover Supabase do tooling

**Files:** `package.json` (root), `pnpm-workspace.yaml`, `.env.example`

- [ ] **Step 1:** Em `pnpm-workspace.yaml`, remover o bloco `onlyBuiltDependencies: [supabase]` (e o comentário). Manter `nodeLinker: hoisted`.
- [ ] **Step 2:** Em `package.json` (root): remover `"supabase"` de `devDependencies`. Substituir os scripts de DB por:

```json
"db:up": "docker compose up -d --wait postgres",
"db:down": "docker compose down",
"db:generate": "pnpm --filter \"./apps/api\" run db:generate",
"db:migrate": "pnpm --filter \"./apps/api\" run db:migrate",
"test:api": "pnpm --filter \"./apps/api\" test",
"ci:local": "pnpm typecheck && pnpm lint && pnpm test:shared && pnpm db:up && pnpm db:migrate && pnpm test:api"
```

- [ ] **Step 3:** Reescrever `.env.example` (sem chaves Supabase):

```ini
# App (build-time) — apps/mobile/.env
APP_SLUG=historias-da-gigi
APP_MODE=SINGLE                 # MULTI | SINGLE
EXPO_PUBLIC_API_URL=http://127.0.0.1:3000

# API (server-side) — apps/api/.env (NUNCA versionar valores reais)
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/storygen
PORT=3000
# JWT_ACCESS_SECRET=        # WP2
# JWT_REFRESH_SECRET=       # WP2
# OPENWEATHER_API_KEY=      # WP4
# AI_PROVIDER_API_KEY=      # WP4
# REVENUECAT_WEBHOOK_SECRET=# WP5
```

- [ ] **Step 4:** `pnpm install` (remove o supabase do lockfile). Gate: `pnpm lint` sai 0.
- [ ] **Step 5:** Commit: `chore(tooling): drop supabase, switch DB scripts to docker+drizzle`.

---

## Task 1 (ajuste): limpar tipos Supabase do `shared`

**Files:** `packages/shared/src/database.types.ts` (remover), `index.ts`, `package.json`

- [ ] **Step 1:** Remover `packages/shared/src/database.types.ts` (era gerado pelo supabase). Remover o export `./database.types` de `package.json` e a re-exportação de `Database` em `src/index.ts`. Manter `schemas.ts` (`GenerateStoryInputSchema`) e seu teste.
- [ ] **Step 2:** Adicionar um contrato DTO de health em `packages/shared/src/schemas.ts`:

```ts
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  db: z.literal("up"),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
```

- [ ] **Step 3:** Gate: `pnpm --filter "./packages/shared" test` (3 testes do schema verdes) e `... run typecheck` limpo.
- [ ] **Step 4:** Commit: `refactor(shared): drop supabase db types, add HealthResponse DTO`.

---

## Task 2 (ajuste): remover supabase-js do app

**Files:** `apps/mobile/src/lib/supabase.ts` (remover), `apps/mobile/src/app/index.tsx`, `apps/mobile/package.json`

- [ ] **Step 1:** Remover `apps/mobile/src/lib/supabase.ts` e a dependência `@supabase/supabase-js` de `apps/mobile/package.json`. (O consumo da API entra na Task 6.)
- [ ] **Step 2:** Em `apps/mobile/src/app/index.tsx`, remover o import/uso do client supabase e o estado `dbStatus` por ora (volta na Task 6 via API). Manter o render `shared import: OK`.
- [ ] **Step 3:** `pnpm install`. Gate: `pnpm --filter "./apps/mobile" run typecheck` limpo.
- [ ] **Step 4:** Commit: `refactor(mobile): remove supabase-js client`.

---

## Task 3 (ajuste): white-label aponta para a API

**Files:** `apps/mobile/app.config.ts`

- [ ] **Step 1:** Em `apps/mobile/app.config.ts`, trocar os extras:

```ts
  extra: {
    ...config.extra,
    appMode: APP_MODE,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3000",
  },
```

- [ ] **Step 2:** Gate: `pnpm --filter "./apps/mobile" exec expo config --type public` mostra `extra.apiUrl` e `extra.appMode`, plugins ainda com `expo-router`.
- [ ] **Step 3:** Commit: `feat(mobile): config points to API url instead of supabase`.

---

## Task 4: Postgres (Docker) + API Fastify + Drizzle

**Files:** `docker-compose.yml`, `apps/api/*`

- [ ] **Step 1:** Criar `docker-compose.yml` na raiz:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: storygen
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d storygen"]
      interval: 2s
      timeout: 5s
      retries: 15
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- [ ] **Step 2:** Criar `apps/api/package.json`:

```json
{
  "name": "@storygen/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@storygen/shared": "workspace:*",
    "drizzle-orm": "^0.36",
    "fastify": "^5",
    "postgres": "^3.4"
  },
  "devDependencies": {
    "@types/node": "^22",
    "drizzle-kit": "^0.28",
    "tsx": "^4",
    "typescript": "^5.6",
    "vitest": "^2"
  }
}
```

- [ ] **Step 3:** Criar `apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"], "outDir": "dist" },
  "include": ["src", "drizzle.config.ts"]
}
```

- [ ] **Step 4:** Criar `apps/api/src/env.ts` (lê env, falha cedo):

```ts
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(process.env.PORT ?? 3000),
};
```

- [ ] **Step 5:** Criar `apps/api/src/db/schema.ts` (smoke; substituído no WP1):

```ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const health = pgTable("health", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").notNull().default("ok"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 6:** Criar `apps/api/src/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

const queryClient = postgres(env.databaseUrl);
export const db = drizzle(queryClient, { schema });
```

- [ ] **Step 7:** Criar `apps/api/drizzle.config.ts`:

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/storygen" },
} satisfies Config;
```

- [ ] **Step 8:** Criar `apps/api/src/db/migrate.ts` (aplica migrations geradas):

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../env.js";

const migrationClient = postgres(env.databaseUrl, { max: 1 });
await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
await migrationClient.end();
console.log("migrations applied");
```

- [ ] **Step 9:** `pnpm install`. Gate: `pnpm --filter "./apps/api" run typecheck` limpo.
- [ ] **Step 10:** Commit: `feat(api): scaffold Fastify+Drizzle app and docker postgres`.

---

## Task 5: Migration + rota `GET /health` + teste de integração

**Files:** `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/drizzle/*` (gerado), `apps/api/src/health.test.ts`, `apps/api/.env`

- [ ] **Step 1:** Criar `apps/api/src/app.ts` (factory Fastify com `GET /health` que faz um SELECT real):

```ts
import Fastify from "fastify";
import { sql } from "drizzle-orm";
import { db } from "./db/client.js";

export function buildApp() {
  const app = Fastify({ logger: false });
  app.get("/health", async () => {
    await db.execute(sql`select 1`); // prova conectividade real com o Postgres
    return { status: "ok", db: "up" };
  });
  return app;
}
```

- [ ] **Step 2:** Criar `apps/api/src/server.ts`:

```ts
import { buildApp } from "./app.js";
import { env } from "./env.js";

const app = buildApp();
app.listen({ port: env.port, host: "0.0.0.0" }).then(() => {
  console.log(`API on :${env.port}`);
});
```

- [ ] **Step 3:** Criar `apps/api/.env` (gitignored pelo `.env` da raiz):

```ini
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/storygen
PORT=3000
```

- [ ] **Step 4:** Subir Postgres e gerar+aplicar a migration:

Run: `pnpm db:up`
Expected: `docker compose up -d --wait postgres` termina com o serviço healthy.
Run: `pnpm --filter "./apps/api" run db:generate`
Expected: cria `apps/api/drizzle/0000_*.sql` com a tabela `health`.
Run: `pnpm db:migrate`
Expected: imprime `migrations applied`.

- [ ] **Step 5:** Escrever o teste de integração `apps/api/src/health.test.ts` (usa `fastify.inject`, sem porta):

```ts
import { describe, it, expect, afterAll } from "vitest";
import { buildApp } from "./app";

const app = buildApp();
afterAll(async () => { await app.close(); });

describe("GET /health", () => {
  it("retorna ok e db up lendo o Postgres", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "up" });
  });
});
```

- [ ] **Step 6:** Rodar o teste (Postgres precisa estar de pé — Step 4):

Run: `pnpm --filter "./apps/api" test`
Expected: 1 teste verde (`GET /health`).

- [ ] **Step 7:** Commit: `feat(api): GET /health reads postgres + integration test + first migration`.

---

## Task 6: App consome `/health` da API

**Files:** `apps/mobile/src/lib/api.ts`, `apps/mobile/src/app/index.tsx`

- [ ] **Step 1:** Criar cliente tipado `apps/mobile/src/lib/api.ts`:

```ts
import Constants from "expo-constants";
import { HealthResponseSchema, type HealthResponse } from "@storygen/shared";

const apiUrl = (Constants.expoConfig?.extra?.apiUrl as string) ?? "http://127.0.0.1:3000";

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${apiUrl}/health`);
  return HealthResponseSchema.parse(await res.json());
}
```

- [ ] **Step 2:** Em `apps/mobile/src/app/index.tsx`, consumir e renderizar:

```tsx
import { useEffect, useState } from "react";
import { getHealth } from "../lib/api";

const [apiStatus, setApiStatus] = useState("...");
useEffect(() => {
  getHealth()
    .then((h) => setApiStatus(`${h.status}/${h.db}`))
    .catch((e) => setApiStatus(`erro: ${e.message}`));
}, []);
// renderizar: <Text>api health: {apiStatus}</Text>
```

- [ ] **Step 3:** Gate headless (a API precisa estar rodando):

Run: `pnpm --filter "./apps/api" run dev &` (ou em outro terminal), aguarde `API on :3000`; então
Run: `curl -s http://127.0.0.1:3000/health`
Expected: `{"status":"ok","db":"up"}`. Pare o `dev` depois.
Run: `pnpm --filter "./apps/mobile" run typecheck` → limpo.
Run: `pnpm --filter "./apps/mobile" exec npx expo export -p web` → bundla sem erro; remover `dist/` depois.

- [ ] **Step 4:** Commit: `feat(mobile): consume API /health via typed client`.

---

## Task 7: CI

**Files:** `.github/workflows/ci.yml`

- [ ] **Step 1:** Reescrever `.github/workflows/ci.yml` (Postgres como service; sem supabase):

```yaml
name: CI
on:
  push: { branches: [master] }
  pull_request:

jobs:
  build-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: storygen
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres -d storygen"
          --health-interval 2s --health-timeout 5s --health-retries 15
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/storygen
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test:shared
      - run: pnpm db:migrate
      - run: pnpm test:api
```

- [ ] **Step 2:** Gate: `pnpm dlx yaml-lint .github/workflows/ci.yml` válido.
- [ ] **Step 3:** Commit: `ci: postgres service + drizzle migrate + api integration tests`.

---

## Task 8: NativeWind v4 — já implementado

Nenhuma mudança. NativeWind v4 + Tailwind v3 + SDK 56 já configurados e provados (CSS de utilities emitido).

---

## Verificação final do WP0

- [ ] **Step 1:** `pnpm ci:local` → typecheck (shared+api+app) ✓ · lint ✓ · test:shared ✓ (3) · db:up ✓ · db:migrate ✓ · test:api ✓ (1).
- [ ] **Step 2:** Com a API rodando (`pnpm --filter "./apps/api" run dev`), `curl http://127.0.0.1:3000/health` → `{"status":"ok","db":"up"}`.

**Done:** monorepo, app, shared, **Postgres em Docker**, **API Fastify + Drizzle**, migration, rota lendo o banco, teste de integração, app↔API e CI provados. Pronto para WP1 (schema Drizzle completo + autorização).

---

## Self-Review (writing-plans)

- **Cobertura WP0 (novo stack):** tooling sem supabase (T0) · shared zod+DTO (T1) · app sem supabase-js (T2) · white-label→apiUrl (T3) · docker postgres + Fastify + Drizzle (T4) · migration + /health + teste integração (T5) · app consome API (T6) · CI com Postgres service (T7) · NativeWind (T8). ✓
- **Sem placeholders:** todo step com código/comando + saída esperada. Gates visuais convertidos em headless (curl + expo export). ✓
- **Sem RLS/pgTAP/Supabase:** removidos; autorização vira responsabilidade da API (provada por integração a partir do WP1). ✓
