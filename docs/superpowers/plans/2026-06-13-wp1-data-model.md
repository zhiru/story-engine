# WP1 — Modelo de Dados (Drizzle) + Harness de Autorização — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Steps usam checkbox.
> Execução no WSL + quoting: ver topo do WP0 e a memória [[git-via-wsl]] (use `bash -lc` p/ pnpm/docker; git msg = aspas simples internas).

**Goal:** Traduzir todo o DDL da Seção 6.3 do SDD v2.1 para o **schema Drizzle** da API, gerar/aplicar a migration (removendo a tabela `health` de smoke), e provar o padrão de **autorização na camada de aplicação** (queries escopadas por usuário) com teste de integração de isolamento.

**Architecture:** Schema Drizzle em `apps/api/src/db/schema.ts` é a fonte única dos tipos do banco. Repositórios (`apps/api/src/repos/*`) encapsulam as queries e **sempre recebem o `actor` (id+role) e escopam por ele** — não há RLS. Testes de integração (vitest) rodam contra o Postgres em Docker, com banco limpo por execução.

**Tech:** Drizzle ORM + drizzle-kit · Postgres 17 (Docker, porta 5433) · vitest · zod (validação de input via `packages/shared`).

**Referência de spec:** SDD §6.3 (DDL completo) e §6.4 (regras de autorização). O DDL no SDD é a fonte autoritativa das colunas — traduza-o fielmente.

---

## Task 1: Schema Drizzle completo

**Files:** `apps/api/src/db/schema.ts` (reescrever)

Traduzir **todas** as tabelas da Seção 6.3 do SDD para Drizzle, substituindo a tabela `health` de smoke. Tabelas (na ordem de dependência):

`users` · `refresh_tokens` · `consent_records` · `child_profiles` · `plans` · `subscriptions` · `usage_records` · `universes` · `characters` · `themes` · `story_arcs` · `stories` · `ai_providers` · `prompt_templates` · `ratings` · `reports` · `notifications` · `audit_logs` · `app_settings` · `collaborations`.

- [ ] **Step 1: Convenções** — todas com `id uuid primaryKey defaultRandom()`, `createdAt`/`updatedAt` timestamptz `defaultNow()`, e `deletedAt` timestamptz nullable (soft-delete) onde o SDD tem `deleted_at`. Use `timestamp(col, { withTimezone: true })`. Enums de domínio: use `text().$type<'A'|'B'>()` (união TS) + validação zod na borda da API; onde quiser reforço no banco, use `check()` do drizzle (`import { check } from "drizzle-orm/pg-core"`). FKs com `.references(() => other.id)`. Arrays (`traits`, `character_names`) com `text("traits").array().notNull().default([])`. JSONB com `jsonb()`.

- [ ] **Step 2: Exemplo de estilo (siga este padrão para todas):**

```ts
import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, numeric } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<"USER" | "MODERATOR" | "ADMIN">().notNull().default("USER"),
  suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const universes = pgTable("universes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  locationContext: text("location_context"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  visibility: text("visibility").$type<"PUBLIC" | "PRIVATE" | "PAID">().notNull().default("PRIVATE"),
  ratingScore: numeric("rating_score").notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
```

- [ ] **Step 3:** Traduzir as demais tabelas seguindo o DDL do SDD §6.3 (colunas, tipos, defaults, FKs, uniques como `stories.user_id`, `ratings unique(universe_id,user_id)`, `story_arcs.version`, `stories.moderation_status/visibility/user_guidance/character_names`, etc.). `collaborations` (Fase 3) e `ratings`/`notifications` (Fase 2) entram como schema apenas.
- [ ] **Step 4:** Gate `pnpm --filter "./apps/api" run typecheck` limpo.
- [ ] **Step 5:** Commit: `feat(db): full drizzle schema for domain (SDD 6.3)`.

---

## Task 2: Migration (substitui health) + /health continua verde

**Files:** `apps/api/drizzle/*` (gerado)

- [ ] **Step 1:** `pnpm db:up` (Postgres healthy).
- [ ] **Step 2:** `pnpm --filter "./apps/api" run db:generate` → gera migration nova com o diff (drop `health` + create de todas as tabelas).
- [ ] **Step 3:** Banco limpo p/ aplicar do zero (volume tem o health antigo): `docker compose down -v && pnpm db:up`, depois `pnpm db:migrate` → "migrations applied".
- [ ] **Step 4:** A rota `GET /health` faz `select 1` (não usa a tabela), então continua válida. Confirme: `pnpm --filter "./apps/api" test` (o teste de /health segue verde).
- [ ] **Step 5:** Commit: `feat(db): generate migration for full schema, drop smoke health table`.

---

## Task 3: Harness de teste de integração

**Files:** `apps/api/src/test/db.ts`, `apps/api/vitest.config.ts` (ajuste se preciso)

- [ ] **Step 1:** Criar helper `apps/api/src/test/db.ts` que, por execução de suíte: aplica migrations a um banco limpo (ou trunca todas as tabelas), e expõe `db` + seeds. Padrão de truncate entre testes:

```ts
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

export async function resetDb() {
  // trunca todas as tabelas do schema public (rápido entre testes)
  await db.execute(sql`
    do $$ declare r record; begin
      for r in (select tablename from pg_tables where schemaname='public' and tablename <> '__drizzle_migrations')
      loop execute 'truncate table public.' || quote_ident(r.tablename) || ' cascade'; end loop;
    end $$;`);
}
```

- [ ] **Step 2:** Seeds mínimos (`seedUser({email, role})`, `seedUniverse({userId, title})`) usando os repos da Task 4 / inserts diretos.
- [ ] **Step 3:** Commit: `test(api): integration db harness (reset + seeds)`.

---

## Task 4: Repo escopado (universes) + teste de isolamento (prova do padrão)

**Files:** `apps/api/src/repos/universes.ts`, `apps/api/src/repos/universes.test.ts`

- [ ] **Step 1:** Criar `apps/api/src/repos/universes.ts` com funções que **sempre recebem o actor** e escopam:

```ts
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { universes } from "../db/schema.js";

type Actor = { id: string; role: "USER" | "MODERATOR" | "ADMIN" };

export async function createUniverse(actor: Actor, input: { title: string; description: string }) {
  const [row] = await db.insert(universes).values({ userId: actor.id, ...input }).returning();
  return row;
}

// dono OU público OU admin/moderador; nunca privado de outro usuário
export async function listVisibleUniverses(actor: Actor) {
  const isAdmin = actor.role === "ADMIN" || actor.role === "MODERATOR";
  return db.select().from(universes).where(and(
    isNull(universes.deletedAt),
    isAdmin ? undefined : or(eq(universes.userId, actor.id), eq(universes.visibility, "PUBLIC")),
  ));
}
```

- [ ] **Step 2: Teste de isolamento que falha-primeiro depois passa** — `apps/api/src/repos/universes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, seedUser } from "../test/db";
import { createUniverse, listVisibleUniverses } from "./universes";

beforeEach(async () => { await resetDb(); });

describe("autorização de universos", () => {
  it("estranho NÃO vê universo privado de outro usuário", async () => {
    const a = await seedUser({ email: "a@x.com" });
    const b = await seedUser({ email: "b@x.com" });
    await createUniverse({ id: a.id, role: "USER" }, { title: "U-A", description: "d" }); // privado por padrão
    const seenByB = await listVisibleUniverses({ id: b.id, role: "USER" });
    expect(seenByB.find((u) => u.title === "U-A")).toBeUndefined();
  });

  it("dono vê o próprio; admin vê tudo", async () => {
    const a = await seedUser({ email: "a@x.com" });
    const adm = await seedUser({ email: "adm@x.com", role: "ADMIN" });
    await createUniverse({ id: a.id, role: "USER" }, { title: "U-A", description: "d" });
    expect((await listVisibleUniverses({ id: a.id, role: "USER" })).length).toBe(1);
    expect((await listVisibleUniverses({ id: adm.id, role: "ADMIN" })).length).toBe(1);
  });
});
```

- [ ] **Step 3:** Rodar `pnpm --filter "./apps/api" test` (Postgres de pé) → todos verdes (health + isolamento).
- [ ] **Step 4:** Commit: `feat(api): scoped universe repo + isolation integration tests`.

---

## Verificação final WP1

- [ ] `pnpm ci:local` verde (typecheck shared+api+app · lint · test:shared · db:up · db:migrate · test:api com isolamento).
- [ ] Schema com todas as tabelas; `health` removida; isolamento provado.

**Done:** modelo de dados completo em Drizzle + padrão de autorização de app provado por teste. Pronto p/ WP2 (auth).

## Self-Review
- Cobre SDD §6.3 (schema) + §6.4 (autorização via repos escopados). Sem RLS/pgTAP. ✓
- `/health` sobrevive ao drop da tabela (usa `select 1`). ✓
- Isolamento testado (estranho negado, dono/admin ok). ✓
