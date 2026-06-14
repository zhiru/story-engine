/**
 * Story generation service — orchestrates the full WP4 pipeline.
 *
 * Steps:
 * 1. Check active subscription → 403 if none.
 * 2. Check quota (usage_records this month vs plan max) → 402 if exceeded.
 * 3. Sanitize + blocklist input guidance → 422 if blocked (no quota).
 * 4. Load universe + characters + theme (+ arc if CONTINUOUS).
 * 5. Get weather/time context.
 * 6. Assemble prompt from active template.
 * 7. Try providers in fallback order (retry ≤ 2 each) → 503 if all fail (no quota).
 * 8. Moderate output; on fail, regenerate once with reinforced instruction; still fail → 422 (no quota).
 * 9. APPROVED: persist story + update arc summary (optimistic lock) + record usage + audit log.
 * 10. Return 201 payload.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  subscriptions,
  plans,
  universes,
  characters,
  themes,
  stories,
  auditLogs,
} from "../db/schema.js";
import { countThisMonth, recordUsage } from "../repos/usage.js";
import { getStoryArcById, updateArcSummary } from "../repos/storyArcs.js";
import { getActiveProviders, getActiveTemplate } from "../ai/provider.js";
import { getContext } from "../ai/context.js";
import { sanitizeGuidance, containsBlocked } from "../ai/sanitize.js";
import { assemblePrompt } from "../ai/prompt.js";
import { moderateOutput } from "../ai/moderation.js";
import type { Actor } from "../auth/middleware.js";
import type { GenerateStoryInput } from "@storygen/shared";

// ── Error types ───────────────────────────────────────────────────────────────

export class GenerationError extends Error {
  constructor(
    public code:
      | "NO_ACTIVE_SUBSCRIPTION"
      | "QUOTA_EXCEEDED"
      | "CONTENT_REJECTED"
      | "GENERATION_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

// ── Helper: compute generation seed ──────────────────────────────────────────

async function computeSeed(userId: string): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10);
  const count = await countThisMonth(userId, "STORY_GENERATED");
  return `${userId}-${dateStr}-${count}`;
}

// ── Helper: get active subscription + plan ────────────────────────────────────

async function getActiveSubscriptionPlan(userId: string) {
  const now = new Date();
  const [row] = await db
    .select({ plan: plans, sub: subscriptions })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "ACTIVE"),
        isNull(subscriptions.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  // Also check period end
  if (row.sub.currentPeriodEnd < now) return null;
  return row.plan;
}

// ── Helper: audit log ─────────────────────────────────────────────────────────

async function insertAuditLog(
  actorId: string,
  action: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
) {
  await db.insert(auditLogs).values({
    actorId,
    action,
    targetType: targetId ? "STORY" : undefined,
    targetId: targetId ?? undefined,
    metadata: metadata ?? {},
  });
}

// ── Main service function ─────────────────────────────────────────────────────

export interface GenerateStoryResult {
  id: string;
  title: string;
  content: string;
  story_arc_id: string | null;
  metadata_weather: { condition: string; temperature: number; currentTime: string };
}

export async function generateStory(
  actor: Actor,
  input: GenerateStoryInput,
): Promise<GenerateStoryResult> {
  // Step 1: Active subscription check
  const plan = await getActiveSubscriptionPlan(actor.id);
  if (!plan) {
    throw new GenerationError(
      "NO_ACTIVE_SUBSCRIPTION",
      "Você precisa de uma assinatura ativa para gerar histórias.",
    );
  }

  // Step 2: Quota check
  const usedThisMonth = await countThisMonth(actor.id, "STORY_GENERATED");
  if (usedThisMonth >= plan.maxStoriesPerMonth) {
    throw new GenerationError(
      "QUOTA_EXCEEDED",
      `Você atingiu o limite de ${plan.maxStoriesPerMonth} histórias por mês do seu plano.`,
    );
  }

  // Step 3: Sanitize + blocklist input guidance
  const rawGuidance = input.user_guidance ?? "";
  const sanitized = rawGuidance ? sanitizeGuidance(rawGuidance) : "";
  if (sanitized && containsBlocked(sanitized)) {
    await insertAuditLog(actor.id, "STORY_GENERATION_INPUT_REJECTED", undefined, {
      reason: "blocked_term_in_guidance",
    });
    throw new GenerationError(
      "CONTENT_REJECTED",
      "A orientação fornecida contém conteúdo inadequado para histórias infantis.",
    );
  }

  // Step 4: Load universe + characters + theme
  const [universe] = await db
    .select()
    .from(universes)
    .where(and(eq(universes.id, input.universe_id), isNull(universes.deletedAt)))
    .limit(1);
  if (!universe) {
    throw new GenerationError("GENERATION_FAILED", "Universo não encontrado.");
  }

  const universeChars = await db
    .select()
    .from(characters)
    .where(
      and(
        eq(characters.universeId, input.universe_id),
        isNull(characters.deletedAt),
      ),
    );

  // Theme: use provided theme_id, or pick the first theme for the universe
  let theme: { id: string; title: string; description: string | null } | null =
    null;
  if (input.theme_id) {
    const [row] = await db
      .select()
      .from(themes)
      .where(
        and(eq(themes.id, input.theme_id), isNull(themes.deletedAt)),
      )
      .limit(1);
    theme = row ?? null;
  }
  if (!theme) {
    const [row] = await db
      .select()
      .from(themes)
      .where(
        and(eq(themes.universeId, input.universe_id), isNull(themes.deletedAt)),
      )
      .limit(1);
    theme = row ?? null;
  }

  // Story arc (for CONTINUOUS)
  let arc: Awaited<ReturnType<typeof getStoryArcById>> = null;
  if (input.story_arc_id) {
    arc = await getStoryArcById(input.story_arc_id);
  }

  const narrativeType: "SINGLE" | "CONTINUOUS" = arc ? "CONTINUOUS" : "SINGLE";

  // Step 5: Weather/time context
  const weather = getContext(actor.id, input.geo);

  // Step 6: Assemble prompt
  const activeTemplate = await getActiveTemplate();
  if (!activeTemplate) {
    throw new GenerationError(
      "GENERATION_FAILED",
      "Nenhum template de prompt ativo encontrado.",
    );
  }

  const seed = await computeSeed(actor.id);

  const charactersFormatted = universeChars
    .map((c) => `${c.name} (${c.classification}): ${c.traits.join(", ")}`)
    .join("; ");

  const promptVars = {
    universe_title: universe.title,
    universe_description: universe.description,
    characters: charactersFormatted || "sem personagens definidos",
    theme_title: theme?.title ?? "Aventura",
    theme_description: theme?.description ?? "",
    narrative_type: narrativeType,
    weather_condition: weather.condition,
    weather_temperature: String(weather.temperature),
    current_time: weather.currentTime,
    previous_summary: arc?.summary ?? undefined,
    user_guidance: sanitized || undefined,
    seed,
  };

  const promptUsed = assemblePrompt(activeTemplate.template, promptVars);

  const generateInput = {
    prompt: promptUsed,
    universe: { title: universe.title, description: universe.description },
    characters: universeChars.map((c) => ({
      name: c.name,
      classification: c.classification,
      traits: c.traits,
    })),
    theme: {
      title: theme?.title ?? "Aventura",
      description: theme?.description ?? null,
    },
    weather,
    narrativeType,
    previousSummary: arc?.summary ?? null,
    userGuidance: sanitized || undefined,
    seed,
  };

  // Step 7: Try providers in fallback order
  const providers = await getActiveProviders();
  if (providers.length === 0) {
    throw new GenerationError(
      "GENERATION_FAILED",
      "Nenhum provedor de IA ativo configurado.",
    );
  }

  let generatedOutput: {
    title: string;
    story_body: string;
    internal_summary_for_next_chapters: string;
  } | null = null;

  for (const { impl } of providers) {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        generatedOutput = await impl.generate(generateInput);
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (generatedOutput) break;
    console.error("Provider failed:", lastErr);
  }

  if (!generatedOutput) {
    throw new GenerationError(
      "GENERATION_FAILED",
      "Não foi possível gerar a história. Tente novamente em instantes.",
    );
  }

  // Step 8: Moderation gate
  let modResult = moderateOutput(generatedOutput.story_body);
  if (!modResult.ok) {
    // Regenerate once with reinforced safety instruction
    const reinforcedInput = {
      ...generateInput,
      seed: seed + "-retry",
      userGuidance: "CONTEÚDO 100% SEGURO PARA CRIANÇAS. " + (generateInput.userGuidance ?? ""),
    };
    for (const { impl } of providers) {
      try {
        generatedOutput = await impl.generate(reinforcedInput);
        break;
      } catch {
        // continue
      }
    }
    modResult = moderateOutput(generatedOutput?.story_body ?? "");
    if (!modResult.ok) {
      await insertAuditLog(actor.id, "STORY_GENERATION_OUTPUT_REJECTED", undefined, {
        reason: modResult.reason,
      });
      throw new GenerationError(
        "CONTENT_REJECTED",
        "O conteúdo gerado não passou pela moderação. Tente novamente com uma orientação diferente.",
      );
    }
  }

  // Step 9: Persist (APPROVED)
  const characterNames = universeChars.map((c) => c.name);
  const generationCost = { provider: "stub", tokens: 0, cost_usd: 0 };

  const [newStory] = await db
    .insert(stories)
    .values({
      universeId: input.universe_id,
      userId: actor.id,
      themeId: theme?.id ?? null,
      storyArcId: arc?.id ?? null,
      title: generatedOutput.title,
      content: generatedOutput.story_body,
      promptTemplateId: activeTemplate.id,
      promptUsed,
      userGuidance: sanitized || null,
      characterNames,
      moderationStatus: "APPROVED",
      visibility: "PRIVATE",
      metadataWeather: weather,
      generationCost,
    })
    .returning();

  if (!newStory) {
    throw new GenerationError("GENERATION_FAILED", "Falha ao persistir a história.");
  }

  // Update arc summary if CONTINUOUS
  if (arc) {
    await updateArcSummary(
      arc.id,
      generatedOutput.internal_summary_for_next_chapters,
      arc.version,
    );
  }

  // Record usage
  await recordUsage(actor.id, "STORY_GENERATED");

  // Audit log
  await insertAuditLog(actor.id, "STORY_GENERATED", newStory.id, {
    universe_id: input.universe_id,
    narrative_type: narrativeType,
    seed,
  });

  return {
    id: newStory.id,
    title: newStory.title,
    content: newStory.content,
    story_arc_id: newStory.storyArcId ?? null,
    metadata_weather: weather,
  };
}
