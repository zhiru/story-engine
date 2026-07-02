/**
 * AI provider adapter (ADR-04).
 * No model name or provider name is hardcoded in logic — resolved from DB rows.
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { aiProviders, promptTemplates } from "../db/schema.js";
import { stubProvider } from "./stubProvider.js";
import { makeOpenAiProvider } from "./openaiProvider.js";
import { env } from "../env.js";
import type { WeatherContext } from "./context.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GenerateInput {
  prompt: string;
  universe: { title: string; description: string };
  characters: Array<{ name: string; classification: string; traits: string[] }>;
  theme: { title: string; description?: string | null };
  weather: WeatherContext;
  narrativeType: "STANDALONE" | "CONTINUOUS";
  previousSummary?: string | null;
  userGuidance?: string;
  seed: string;
}

/** Tokens consumidos, lidos do campo `usage` da resposta do provedor (SDD 8.5). */
export interface GenerateUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateOutput {
  title: string;
  story_body: string;
  internal_summary_for_next_chapters: string;
  usage?: GenerateUsage;
}

export interface AiProvider {
  generate(input: GenerateInput): Promise<GenerateOutput>;
}

export interface AiProviderRow {
  id: string;
  provider: string;
  model: string;
  params: Record<string, unknown>;
  fallbackOrder: number;
}

// ── Registry ──────────────────────────────────────────────────────────────────

function resolveProvider(row: AiProviderRow): AiProvider {
  if (row.provider === "stub") {
    return stubProvider;
  }
  // Gateways/Provedores compatíveis com OpenAI (ex.: OmniRoute -> Claude, OpenAI).
  // Chave SEMPRE do env; se ausente, o generate() lança e o pipeline cai no fallback.
  if (row.provider === "openai" || row.provider === "omniroute") {
    return makeOpenAiProvider({
      baseUrl: env.aiBaseUrl,
      apiKey: env.aiApiKey,
      model: row.model || env.aiModel,
      // max_tokens/temperature vêm de ai_providers.params (RF-43) — nada hardcoded.
      params: row.params,
    });
  }
  throw new Error(
    `AI provider '${row.provider}' is not implemented. Add an adapter to register it.`,
  );
}

// ── DB helpers ────────────────────────────────────────────────────────────────

export async function getActiveProviders(): Promise<
  Array<{ row: AiProviderRow; impl: AiProvider }>
> {
  const rows = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.isActive, true), isNull(aiProviders.deletedAt)))
    .orderBy(asc(aiProviders.fallbackOrder));

  return rows.map((r) => ({
    row: {
      id: r.id,
      provider: r.provider,
      model: r.model,
      params: (r.params as Record<string, unknown>) ?? {},
      fallbackOrder: r.fallbackOrder,
    },
    impl: resolveProvider({
      id: r.id,
      provider: r.provider,
      model: r.model,
      params: (r.params as Record<string, unknown>) ?? {},
      fallbackOrder: r.fallbackOrder,
    }),
  }));
}

export interface ActiveTemplate {
  id: string;
  template: string;
  variables: string[];
}

export async function getActiveTemplate(): Promise<ActiveTemplate | null> {
  const [row] = await db
    .select()
    .from(promptTemplates)
    .where(
      and(
        eq(promptTemplates.isActive, true),
        isNull(promptTemplates.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    template: row.template,
    variables: (row.variables as string[]) ?? [],
  };
}
