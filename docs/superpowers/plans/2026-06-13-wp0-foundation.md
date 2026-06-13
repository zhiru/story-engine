# WP0 — Fundação & Tooling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar tarefa-a-tarefa. Steps usam checkbox (`- [ ]`).
>
> **v2 (2026-06-13):** revisado por painel adversarial. Correções aplicadas: vitest (não jest-ESM) no `shared`; `eslint.config.js` flat-config criado; `create-expo-app --no-install` + limpeza de artefatos pnpm + checagem de workspace aninhado; filtro pnpm por **path** (`./apps/mobile`), não por nome; `app.config.ts` **mescla** `app.json` (preserva plugin expo-router); migration dedicada habilita **pgtap**; `seed.sql` determinístico (sem `supabase db query`); `.env` no nível do app com URL+anon key; `apps/mobile` ganha script `typecheck`; `nodeLinker: hoisted` no `pnpm-workspace.yaml`; NativeWind pinado `^4`.

**Goal:** Provar de ponta a ponta o esqueleto do StoryGen Engine: monorepo pnpm, app Expo Router bootando, pacote `shared` com schema testado, Supabase local (Docker) com migration + tipos gerados + pgTAP, app lendo do Postgres local, e CI verde.

**Architecture:** Monorepo pnpm com `nodeLinker: hoisted` (Metro/React Native não lidam bem com o store simbólico do pnpm). `apps/mobile` é o app Expo Router; `packages/shared` (`@storygen/shared`) exporta schemas zod + tipos do banco, consumido pelo app via resolução de workspace. `shared` depende **só de zod** (sem react/react-native) — evita duplicar React no Metro. `supabase/` é o projeto CLI (Docker local). Nenhuma Edge Function ainda (WP4) — WP0 só prova a tubulação.

**Tech Stack:** pnpm 10 · Node 22 · TypeScript · Expo Router · NativeWind v4 · zod · **vitest** · Supabase CLI (devDependency) · pgTAP · Docker · GitHub Actions · ESLint 9 (flat config).

**Ambiente verificado:** node v22.22.2, pnpm 10.22.0, Docker 29.1.3, git 2.43.0 (rodar tudo dentro do WSL Ubuntu). Comandos abaixo assumem cwd = raiz do repo `~/projetos/docker/story-engine`.

> **Nota TDD:** passos com lógica (schema zod, migration) têm teste-que-falha-primeiro. Passos de scaffold/infra usam **gate de verificação** (rodar + observar saída esperada).

---

## Mapa de arquivos (criados neste WP)

| Arquivo | Responsabilidade |
|---|---|
| `package.json` (root) | Scripts de orquestração + devDeps |
| `pnpm-workspace.yaml` | Declara `apps/*`,`packages/*` + `nodeLinker: hoisted` |
| `tsconfig.base.json` | Opções TS compartilhadas |
| `eslint.config.js` | Flat config (ESLint 9) — lint do `packages/**` + arquivos de config |
| `.gitignore` | já existe — acrescentar só o que falta |
| `.env.example` | Contrato de variáveis (sem segredos) |
| `packages/shared/*` | Pacote `@storygen/shared`: schemas zod + tipos do banco |
| `apps/mobile/*` | App Expo Router (scaffold) |
| `apps/mobile/app.config.ts` | White-label: mescla `app.json`, injeta `APP_SLUG`/`APP_MODE` |
| `apps/mobile/.env` | (gitignored) URL+anon key do Supabase local + APP_SLUG/APP_MODE |
| `apps/mobile/src/lib/supabase.ts` | Client Supabase |
| `supabase/config.toml` | Config local (gerado por `supabase init`) |
| `supabase/migrations/*_init_extensions.sql` | Habilita `pgtap` |
| `supabase/migrations/*_smoke_health.sql` | Tabela `health` (smoke; removida no WP1) |
| `supabase/seed.sql` | Linha determinística em `health` |
| `supabase/tests/00_smoke.sql` | Teste pgTAP smoke |
| `.github/workflows/ci.yml` | Pipeline CI |

---

## Task 0: Workspace pnpm + tooling base

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Criar `pnpm-workspace.yaml`** (linker hoisted aqui — fonte única; ver nota de risco)

```yaml
packages:
  - "apps/*"
  - "packages/*"
nodeLinker: hoisted
# pnpm 10 bloqueia scripts de build de dependências por padrão; o CLI do supabase
# baixa seu binário via postinstall. Sem este whitelist, `pnpm install --frozen-lockfile`
# (CI) deixa o binário ausente e `pnpm supabase ...` falha.
onlyBuiltDependencies:
  - supabase
```

- [ ] **Step 2: Criar `package.json` raiz**

```json
{
  "name": "storygen-engine",
  "private": true,
  "packageManager": "pnpm@10.22.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "typecheck": "pnpm -r --if-present run typecheck",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test:shared": "pnpm --filter \"./packages/shared\" test",
    "db:reset": "supabase db reset",
    "db:test": "supabase test db",
    "db:types": "supabase gen types typescript --local > packages/shared/src/database.types.ts",
    "ci:local": "pnpm typecheck && pnpm lint && pnpm test:shared && supabase db reset && supabase test db"
  },
  "devDependencies": {
    "@eslint/js": "^9",
    "@types/node": "^22",
    "eslint": "^9",
    "prettier": "^3",
    "supabase": "2.34.3",
    "typescript": "^5.6",
    "typescript-eslint": "^8"
  }
}
```

> Nota: `supabase` pinado em versão exata (não `^2`) para casar com a CI e evitar drift de comportamento do `test db` entre minors.

- [ ] **Step 3: Criar `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: Criar `eslint.config.js`** (flat config; ESLint 9 não usa mais `--ext`). Lint focado em `packages/**` + arquivos de config; `apps/mobile` (config Expo própria) e `supabase/functions` (Deno) ganham lint nos seus WPs.

```js
// @ts-check
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  { ignores: ["**/node_modules/**", "**/.expo/**", "**/dist/**", "apps/mobile/**", "supabase/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["packages/**/*.ts", "*.config.js"] },
  {
    // o próprio eslint.config.js é CJS — libera globals de Node p/ não auto-falhar
    files: ["*.config.js"],
    languageOptions: { globals: { require: "readonly", module: "writable", __dirname: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  }
);
```

- [ ] **Step 5: Criar `.env.example`** (contrato; valores reais vão em `.env` gitignored / Vault). Vars `EXPO_PUBLIC_*` e `APP_*` são carregadas pelo Expo a partir de **`apps/mobile/.env`** (não a raiz) — ver Task 4/6.

```ini
# App (build-time, perfil EAS) — ver ADR-06 — colocar em apps/mobile/.env
APP_SLUG=historias-da-gigi
APP_MODE=SINGLE                 # MULTI | SINGLE
# Supabase — colocar em apps/mobile/.env
# A anon key é segura no cliente SOMENTE se toda tabela tiver RLS restritiva.
# (No WP0 a tabela `health` usa USING(true) — exceção temporária; o WP1 a remove.)
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<preencher com a anon key de `supabase start`>
# Segredos (NUNCA no cliente — só em Edge Functions / Vault). Referência:
# OPENWEATHER_API_KEY=
# AI_PROVIDER_API_KEY=
# REVENUECAT_WEBHOOK_SECRET=
# LGPD_HASH_SALT=
```

- [ ] **Step 6: Acrescentar ao `.gitignore`** — o repo já ignora `node_modules/`, `.env`, `.env.*` (com `!.env.example`), `dist`, `*.log`. Falta só o diretório do Expo:

```gitignore
apps/mobile/.expo/
```

- [ ] **Step 7: Instalar devDeps na raiz**

Run: `pnpm install`
Expected: instala devDeps no root; cria `node_modules/` hoisted; sem erros.

- [ ] **Step 8: Verificar CLIs (gate)**

Run: `pnpm supabase --version && pnpm exec eslint --version`
Expected: imprime versão `2.34.3` do Supabase e `v9.x` do ESLint, sem erro.

- [ ] **Step 9: Lint roda limpo sem fontes ainda (gate)**

Run: `pnpm lint`
Expected: sai 0 (nenhum arquivo em `packages/**` ainda; sem erro de "config não encontrado").

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json eslint.config.js .env.example .gitignore pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo tooling"
```

---

## Task 1: Pacote `@storygen/shared` com primeiro schema (TDD, vitest)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/schemas.ts`, `packages/shared/src/database.types.ts` (placeholder)
- Test: `packages/shared/src/schemas.test.ts`

- [ ] **Step 1: Criar `packages/shared/package.json`** (vitest evita o atrito de jest+ESM)

```json
{
  "name": "@storygen/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./schemas": "./src/schemas.ts",
    "./database.types": "./src/database.types.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^3.23" },
  "devDependencies": { "vitest": "^2" }
}
```

- [ ] **Step 2: Criar `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src"]
}
```

- [ ] **Step 3: Criar placeholder `packages/shared/src/database.types.ts`** (o export `./database.types` é declarado já no Task 1; substituído pelo tipo real no Task 4)

```ts
// Substituído por `pnpm run db:types` no Task 4.
export type Database = unknown;
```

- [ ] **Step 4: Escrever o teste que falha** — `packages/shared/src/schemas.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { GenerateStoryInputSchema } from "./schemas";

describe("GenerateStoryInputSchema", () => {
  it("aceita payload mínimo válido", () => {
    const r = GenerateStoryInputSchema.safeParse({ universe_id: "11111111-1111-1111-1111-111111111111" });
    expect(r.success).toBe(true);
  });

  it("rejeita universe_id que não é uuid", () => {
    const r = GenerateStoryInputSchema.safeParse({ universe_id: "nope" });
    expect(r.success).toBe(false);
  });

  it("rejeita user_guidance acima de 500 chars", () => {
    const r = GenerateStoryInputSchema.safeParse({
      universe_id: "11111111-1111-1111-1111-111111111111",
      user_guidance: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 5: Instalar deps do pacote e rodar o teste — deve FALHAR**

Run: `pnpm install && pnpm --filter "./packages/shared" test`
Expected: FAIL — `Failed to resolve import "./schemas"` (arquivo ainda não existe).

- [ ] **Step 6: Implementar `packages/shared/src/schemas.ts`** (contrato de `POST /stories/generate`, SDD §7.2 + §8.2)

```ts
import { z } from "zod";

export const GenerateStoryInputSchema = z.object({
  universe_id: z.string().uuid(),
  theme_id: z.string().uuid().nullish(),
  story_arc_id: z.string().uuid().nullish(),
  child_profile_id: z.string().uuid().nullish(),
  user_guidance: z.string().max(500).optional(), // SDD §8.2: teto de 500 chars
  geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

export type GenerateStoryInput = z.infer<typeof GenerateStoryInputSchema>;
```

- [ ] **Step 7: Criar barrel `packages/shared/src/index.ts`**

```ts
export * from "./schemas";
export type { Database } from "./database.types";
```

- [ ] **Step 8: Rodar o teste — deve PASSAR**

Run: `pnpm --filter "./packages/shared" test`
Expected: PASS, 3 testes verdes.

- [ ] **Step 9: Typecheck do pacote (gate)**

Run: `pnpm --filter "./packages/shared" run typecheck`
Expected: sem erros.

- [ ] **Step 10: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): add GenerateStoryInput zod schema with vitest tests"
```

---

## Task 2: Scaffold do app Expo Router (monorepo-aware)

**Files:**
- Create: `apps/mobile/*` (scaffold), `apps/mobile/metro.config.js`
- Modify: `apps/mobile/package.json` (deps + script typecheck), `apps/mobile/tsconfig.json`, tela inicial

- [ ] **Step 1: Gerar o app sem auto-install** (evita lockfile/workspace aninhado do create-expo)

Run: `pnpm create expo-app apps/mobile --template default --no-install`
Expected: cria `apps/mobile` com Expo Router (pasta `app/`, `app.json`, `package.json`).

- [ ] **Step 2: Limpar artefatos do create-expo e reconciliar no workspace** (pnpm gera `pnpm-lock.yaml`/`pnpm-workspace.yaml`, não `package-lock.json`)

Run: `rm -rf apps/mobile/node_modules apps/mobile/pnpm-lock.yaml apps/mobile/package-lock.json apps/mobile/pnpm-workspace.yaml apps/mobile/.npmrc 2>/dev/null; pnpm install`
Expected: sem erro.

- [ ] **Step 3: Confirmar que NÃO há workspace aninhado (gate)**

Run: `test ! -f apps/mobile/pnpm-workspace.yaml && echo OK`
Expected: imprime `OK`. Se falhar, remover o arquivo e re-rodar `pnpm install`.

- [ ] **Step 4: Adicionar `@storygen/shared` + script `typecheck` ao app** — editar `apps/mobile/package.json`:
  - em `dependencies`, acrescentar: `"@storygen/shared": "workspace:*"`
  - em `scripts`, acrescentar: `"typecheck": "tsc --noEmit"`

Depois: `pnpm install`
Expected: link de workspace criado.

- [ ] **Step 5: Configurar Metro para monorepo** — criar `apps/mobile/metro.config.js`

```js
// Expo SDK 52+ já detecta monorepo; mantemos explícito p/ clareza.
// `@storygen/shared` não declara react/react-native, então não há risco de React duplicado.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
```

- [ ] **Step 6: Apontar o tsconfig do app para a base** — editar `apps/mobile/tsconfig.json`

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@storygen/shared": ["../../packages/shared/src/index.ts"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 7: Descobrir e fixar o caminho da tela inicial (gate)**

Run: `ls apps/mobile/app`
Expected: o template `default` traz `app/(tabs)/index.tsx`. **Use este caminho em todas as edições seguintes.** Se o template tiver mudado, pare e use o caminho real impresso aqui.

- [ ] **Step 8: Consumir o schema compartilhado** — editar `apps/mobile/app/(tabs)/index.tsx`, adicionar import e uso no componente:

```tsx
import { GenerateStoryInputSchema } from "@storygen/shared";

// dentro do componente, antes do return:
const sharedOk = GenerateStoryInputSchema.safeParse({
  universe_id: "11111111-1111-1111-1111-111111111111",
}).success;
// renderize em um <Text>: `shared import: ${sharedOk ? "OK" : "FAIL"}`
```

- [ ] **Step 9: Typecheck do app (gate)**

Run: `pnpm --filter "./apps/mobile" run typecheck`
Expected: sem erros (valida o import de `@storygen/shared`).

- [ ] **Step 10: Bootar o app na web (gate)**

Run: `pnpm --filter "./apps/mobile" exec expo start --web`
Expected: Metro compila sem erro de resolução; a página mostra `shared import: OK`. Ctrl+C.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile pnpm-lock.yaml
git commit -m "feat(mobile): scaffold Expo Router app consuming @storygen/shared"
```

---

## Task 3: White-label via `app.config.ts` (APP_SLUG / APP_MODE)

**Files:**
- Create: `apps/mobile/app.config.ts` (mantém `app.json` — a config dinâmica o **mescla**, preservando o plugin `expo-router`, `web.bundler`, `ios`/`android`)

- [ ] **Step 1: Criar `apps/mobile/app.config.ts`** (ADR-06; recebe `app.json` como `config` e sobrescreve campos white-label)

```ts
import type { ExpoConfig, ConfigContext } from "expo/config";

const APP_SLUG = process.env.APP_SLUG ?? "storygen-dev";
const APP_MODE = (process.env.APP_MODE ?? "SINGLE") as "MULTI" | "SINGLE";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config, // preserva plugins (expo-router), scheme, web.bundler, ios/android do app.json
  name: APP_SLUG,
  slug: APP_SLUG,
  extra: {
    ...config.extra,
    appMode: APP_MODE,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
```

- [ ] **Step 2: Verificar que a config preserva o expo-router E aplica o env (gate)**

Run: `pnpm --filter "./apps/mobile" exec expo config --type public`
Expected: JSON com `"name": "storygen-dev"`, `extra.appMode: "SINGLE"`, e `plugins` contendo `"expo-router"` (e `web.bundler: "metro"`). Override:
Run: `APP_MODE=MULTI APP_SLUG=meu-universo pnpm --filter "./apps/mobile" exec expo config --type public`
Expected: `"name": "meu-universo"`, `extra.appMode: "MULTI"`, plugins ainda com `expo-router`.

- [ ] **Step 3: Bootar para garantir que o roteamento segue funcionando (gate)**

Run: `pnpm --filter "./apps/mobile" exec expo start --web`
Expected: app abre normalmente (file-based routing intacto). Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app.config.ts
git commit -m "feat(mobile): white-label config merging app.json via APP_SLUG/APP_MODE"
```

---

## Task 4: Supabase local + migrations (pgtap + smoke) + seed + tipos

**Files:**
- Create: `supabase/config.toml` (via init), `supabase/migrations/<ts>_init_extensions.sql`, `supabase/migrations/<ts>_smoke_health.sql`, `supabase/seed.sql`, `packages/shared/src/database.types.ts` (gerado)

- [ ] **Step 1: Inicializar o projeto Supabase**

Run: `pnpm supabase init`
Expected: cria `supabase/config.toml` e `supabase/.gitignore`. Recusar geração de settings de VS Code/Deno.

- [ ] **Step 2: Subir o stack local (requer Docker rodando)**

Run: `pnpm supabase start`
Expected: baixa imagens (1ª vez), imprime `API URL: http://127.0.0.1:54321` e a `anon key`. Guarde a anon key para o Task 6.

- [ ] **Step 3: Migration que habilita pgTAP** (criada primeiro → timestamp mais antigo → roda antes do teste)

Run: `pnpm supabase migration new init_extensions`
Preencher o arquivo gerado:

```sql
-- pgTAP é dependência da suíte de testes de DB (roda via `supabase test db`).
create extension if not exists pgtap with schema extensions;
```

- [ ] **Step 4: Migration smoke**

Run: `pnpm supabase migration new smoke_health`
Preencher:

```sql
-- Smoke: prova o pipeline migration + RLS. REMOVIDA por migration própria no WP1.
create table public.health (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'ok',
  created_at timestamptz not null default now()
);

alter table public.health enable row level security;

-- Exceção temporária do WP0: leitura pública. O WP1 dropa esta tabela+policy.
create policy "health readable by anon" on public.health
  for select using (true);
```

- [ ] **Step 5: Seed determinístico** — criar `supabase/seed.sql` (aplicado por `db reset`)

```sql
insert into public.health (status) values ('ok');
```

- [ ] **Step 6: Aplicar via reset (gate)**

Run: `pnpm supabase db reset`
Expected: roda as 2 migrations + seed; termina com `Finished supabase db reset`. Sem erro de SQL.

- [ ] **Step 7: Gerar tipos TypeScript do banco** (substitui o placeholder do Task 1)

Run: `pnpm run db:types`
Expected: `packages/shared/src/database.types.ts` passa a conter `health` em `Tables` (não mais `unknown`).

- [ ] **Step 8: Typecheck do shared com os tipos reais (gate)**

Run: `pnpm --filter "./packages/shared" run typecheck`
Expected: sem erros.

- [ ] **Step 9: Commit** (inclui o `supabase/.gitignore` criado pelo init)

```bash
git add supabase/ packages/shared/src/database.types.ts
git commit -m "feat(db): supabase local + pgtap + smoke health migration + seed + types"
```

---

## Task 5: Teste pgTAP da migration (suíte de DB)

**Files:**
- Create: `supabase/tests/00_smoke.sql`

- [ ] **Step 1: Escrever o teste pgTAP** — `supabase/tests/00_smoke.sql` (com `search_path` incluindo `extensions`, onde o pgtap foi instalado)

```sql
begin;
set search_path to extensions, public;
select plan(3);

select has_table('public', 'health', 'tabela health existe');
select col_is_pk('public', 'health', 'id', 'id é PK');
select is(
  (select relrowsecurity from pg_class where oid = 'public.health'::regclass),
  true,
  'RLS habilitado em health'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Rodar a suíte — deve PASSAR**

Run: `pnpm supabase test db`
Expected: `00_smoke.sql .. ok` / `All tests successful.` (3 asserts).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/00_smoke.sql
git commit -m "test(db): pgTAP smoke test for health table + RLS"
```

> Precedente para o WP1: a suíte real afirmará não só RLS habilitado, mas **negação da persona errada** (estranho/anônimo) — "RLS habilitado" sozinho não prova proteção.

---

## Task 6: Client Supabase no app + leitura real do Postgres local

**Files:**
- Create: `apps/mobile/src/lib/supabase.ts`, `apps/mobile/.env` (gitignored)
- Modify: tela inicial (`app/(tabs)/index.tsx`) para exibir o `status` lido de `health`

- [ ] **Step 1: Criar `apps/mobile/.env`** (project root do Expo — é daqui que o Expo carrega o env). Preencher com os valores impressos no Task 4 Step 2:

```ini
APP_SLUG=storygen-dev
APP_MODE=SINGLE
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<cole aqui a anon key do `supabase start`>
```

- [ ] **Step 2: Gate — `.env` existe e tem a anon key**

Run: `test -s apps/mobile/.env && grep -q 'EXPO_PUBLIC_SUPABASE_ANON_KEY=ey' apps/mobile/.env && echo ENV_OK`
Expected: imprime `ENV_OK` (a anon key JWT começa com `ey`). Confirme também que `apps/mobile/.env` está gitignored: `git check-ignore apps/mobile/.env` deve imprimir o caminho.

- [ ] **Step 3: Instalar o client**

Run: `pnpm --filter "./apps/mobile" exec expo install @supabase/supabase-js`
Expected: adiciona `@supabase/supabase-js` ao app.

- [ ] **Step 4: Criar `apps/mobile/src/lib/supabase.ts`**

```ts
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import type { Database } from "@storygen/shared/database.types";

const url = Constants.expoConfig?.extra?.supabaseUrl as string;
const anonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string;

export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: false }, // sessão/auth entra no WP2
});
```

- [ ] **Step 5: Ler `health` na tela inicial** — editar `apps/mobile/src/app/index.tsx` (template SDK 56 usa layout `src/app/`; ajuste o import relativo do client p/ `../lib/supabase`):

```tsx
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { supabase } from "../lib/supabase"; // de src/app/index.tsx para src/lib/supabase.ts

// dentro do componente:
const [dbStatus, setDbStatus] = useState("...");
useEffect(() => {
  supabase
    .from("health")
    .select("status")
    .limit(1)
    .single()
    .then(({ data, error }) => setDbStatus(error ? `erro: ${error.message}` : (data?.status ?? "vazio")));
}, []);
// renderizar: <Text>db health: {dbStatus}</Text>
```

> O `seed.sql` (Task 4 Step 5) já garante uma linha `health.status='ok'` após `db reset` — `.single()` não dará `PGRST116`.

- [ ] **Step 6: Verificar leitura e2e (gate)**

Run: `pnpm supabase db reset && pnpm --filter "./apps/mobile" exec expo start --web`
Expected: a tela mostra `db health: ok` (anon lê via política de leitura pública). Confirma app↔Postgres local. Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile pnpm-lock.yaml
git commit -m "feat(mobile): supabase client reads health from local postgres"
```

---

## Task 7: CI (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Criar `.github/workflows/ci.yml`** (usa o `supabase` da devDependency — fonte única de versão; sem `setup-cli`)

```yaml
name: CI
on:
  push: { branches: [master] }
  pull_request:

jobs:
  build-test:
    runs-on: ubuntu-latest
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
      - run: pnpm supabase start
      - run: pnpm supabase db reset
      - run: pnpm supabase test db
      - if: always()
        run: pnpm supabase stop
```

> `pnpm typecheck` agora cobre o app (script `typecheck` adicionado no Task 2 Step 4) além do `shared`.

- [ ] **Step 2: Validar o YAML (gate)**

Run: `pnpm dlx yaml-lint .github/workflows/ci.yml` (ou inspeção visual se indisponível)
Expected: YAML válido.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck, lint, shared tests, supabase db reset + pgTAP"
```

---

## Task 8: NativeWind v4 (ADR-03)

> **Layout SDK 56:** o template já traz `apps/mobile/src/global.css` (importado em `src/app/_layout.tsx`) e usa `src/app/`. Reaproveite esse CSS — NÃO crie `apps/mobile/global.css`. Consulte os docs versionados https://docs.expo.dev/versions/v56.0.0/ (ver `apps/mobile/AGENTS.md`). Confirme a compatibilidade NativeWind v4 × Expo SDK 56 antes; se conflitar, reporte (BLOCKED) em vez de forçar.

**Files:**
- Create: `apps/mobile/tailwind.config.js`, `apps/mobile/nativewind-env.d.ts`
- Modify: `apps/mobile/src/global.css` (adicionar diretivas `@tailwind`), `apps/mobile/babel.config.js`, `apps/mobile/metro.config.js`, `apps/mobile/src/app/_layout.tsx` (já importa o global.css), `apps/mobile/src/app/index.tsx`

- [ ] **Step 1: Instalar NativeWind v4 (pinado) + peers** (`expo install` resolve versões compatíveis com o SDK)

Run: `pnpm --filter "./apps/mobile" exec expo install nativewind@^4 tailwindcss@^3 react-native-reanimated react-native-safe-area-context`
Expected: pacotes adicionados; nativewind 4.x. **Pinar `tailwindcss@^3`**: NativeWind v4 é construído sobre Tailwind v3 e quebra com Tailwind v4 (peer conflict em `react-native-css-interop`). Se `expo install` resolver tailwind 4, rode `expo install tailwindcss@3`.

- [ ] **Step 2: Criar `apps/mobile/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 3: Garantir as diretivas Tailwind em `apps/mobile/src/global.css`** (arquivo já existe no template; adicione no topo se ausentes)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Criar `apps/mobile/nativewind-env.d.ts`**

```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 5: Editar `apps/mobile/babel.config.js`** — preset jsxImportSource + nativewind. **Não** adicionar `react-native-reanimated/plugin` manualmente: `babel-preset-expo` (SDK 50+) já injeta o plugin de worklets compatível; adicioná-lo à mão causa erro de plugin duplicado/movido.

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

- [ ] **Step 6: Envolver o Metro com NativeWind** — atualizar `apps/mobile/metro.config.js` (mantendo o monorepo da Task 2)

```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = withNativeWind(config, { input: "./src/global.css" });
```

- [ ] **Step 7: Confirmar import do `global.css` no layout raiz** — `apps/mobile/src/app/_layout.tsx` já importa `../global.css` (o template SDK 56 traz isso). Verifique; só adicione se faltar.

- [ ] **Step 8: Renderizar elemento estilizado e verificar (gate)** — em `apps/mobile/src/app/index.tsx`, envolver com `className`:

```tsx
import { View, Text } from "react-native";
// <View className="flex-1 items-center justify-center bg-violet-100">
//   <Text className="text-violet-900 text-xl font-bold">StoryGen</Text>
// </View>
```

Run: `pnpm --filter "./apps/mobile" exec expo start --web`
Expected: fundo violeta claro, texto violeta em negrito — NativeWind ativo. Ctrl+C.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile pnpm-lock.yaml
git commit -m "feat(mobile): set up NativeWind v4 styling"
```

---

## Verificação final do WP0

- [ ] **Step 1: Rodar o gate completo**

Run: `pnpm ci:local`
Expected: typecheck (shared **e app**) ✓, lint ✓, testes shared ✓ (3), `supabase db reset` ✓, `supabase test db` ✓ (3 asserts). Tudo verde.

- [ ] **Step 2: Confirmar o app**

Run: `pnpm --filter "./apps/mobile" exec expo start --web`
Expected: app boota, NativeWind aplicado, `db health: ok` exibido.

**Done:** monorepo, app, shared, Supabase local, migrations, tipos, pgTAP, conectividade app↔DB e CI provados. Pronto para WP1 (modelo de dados completo + RLS + remoção da tabela `health`).

---

## Self-Review (writing-plans)

- **Cobertura do escopo WP0:** monorepo+eslint (T0) · shared+vitest (T1) · app Expo (T2) · white-label merge (T3) · supabase+pgtap+smoke+seed+tipos (T4) · pgTAP (T5) · app↔DB (T6) · CI (T7) · NativeWind v4 (T8). ✓
- **Sem placeholders:** todo step de código mostra o código; caminho da tela fixado via gate (T2.7); env do app explícito (T6.1/6.2); seed determinístico (sem `db query`). ✓
- **Consistência de tipos/nomes:** `GenerateStoryInputSchema`/`GenerateStoryInput` (T1) reusados; `Database` placeholder (T1) → real (T4) → importado (T6); filtro `./apps/mobile` consistente (T2/3/6/8); `database.types` export resolve desde T1. ✓
- **Riscos sinalizados e resolvidos:** linker hoisted em pnpm-workspace.yaml (T0.1); create-expo `--no-install` + limpeza pnpm + checagem de workspace aninhado (T2.1-2.3); pgtap em migration própria + `search_path` no teste (T4.3/T5.1); app.config mescla app.json preservando expo-router (T3); `.env` no nível do app com gate (T6.1/6.2); NativeWind pinado e sem reanimated plugin manual (T8.1/8.5). ✓
