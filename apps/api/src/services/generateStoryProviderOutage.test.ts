/**
 * Finding 10: na regeneração REFORÇADA, se todos os provedores falharem
 * (outage transitório), o pipeline deve responder 503 GENERATION_FAILED — e
 * NÃO 422 CONTENT_REJECTED por moderar uma string vazia.
 *
 * Cenário exercitado: a 1ª geração retorna um corpo que REPROVA na moderação
 * de saída (contém marcação crua "```"), forçando a regeneração reforçada; nela
 * o provedor lança em todas as tentativas → tryProviders devolve null.
 *
 * Como o stub determinístico nunca falha, mockamos apenas getActiveProviders
 * (mantendo getActiveTemplate real, lendo o template semeado no banco).
 */
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("../ai/provider.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/provider.js")>();
  return { ...actual, getActiveProviders: vi.fn() };
});

import { generateStory, GenerationError } from "./generateStory.js";
import { getActiveProviders } from "../ai/provider.js";
import type { AiProvider, GenerateInput, GenerateOutput } from "../ai/provider.js";
import { db } from "../db/client.js";
import { resetDb, seedUser } from "../test/db.js";
import {
  plans,
  subscriptions,
  universes,
  characters,
  themes,
  stories,
  usageRecords,
  aiProviders,
  promptTemplates,
} from "../db/schema.js";
import type { Actor } from "../auth/middleware.js";

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

// Corpo longo o suficiente (>100 chars), sem termos de blocklist, mas com "```"
// → reprova na moderação (raw_markup_in_output).
const FAILING_BODY =
  "Era uma vez uma pequena aventura tranquila e alegre no bosque encantado, " +
  "cheia de amigos brincando juntos sob o sol dourado da tarde. ```json vazado``` " +
  "e todos continuaram a brincadeira feliz até o fim do dia radiante.";

/** Provedor que devolve corpo reprovado na 1ª geração e falha na regeneração. */
const flakyProvider: AiProvider = {
  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const isReinforced =
      input.seed.endsWith("-retry") || input.prompt.includes("REFORÇO DE SEGURANÇA");
    if (isReinforced) {
      throw new Error("simulated provider outage during reinforced regeneration");
    }
    return {
      title: "Título",
      story_body: FAILING_BODY,
      internal_summary_for_next_chapters: "resumo",
      usage: { inputTokens: 10, outputTokens: 20 },
    };
  },
};

async function seedReadyEnv() {
  const user = await seedUser({ email: "outage@test.com" });
  const [plan] = await db
    .insert(plans)
    .values({ name: "P", maxUniverses: 10, maxStoriesPerMonth: 10, priceCents: 0 })
    .returning();
  const periodEnd = new Date();
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  await db.insert(subscriptions).values({
    userId: user.id,
    planId: plan!.id,
    status: "ACTIVE",
    store: "STRIPE",
    currentPeriodEnd: periodEnd,
  });
  const [universe] = await db
    .insert(universes)
    .values({
      userId: user.id,
      title: "Mundo",
      description: "Universo de teste.",
      visibility: "PRIVATE",
    })
    .returning();
  await db.insert(characters).values({
    universeId: universe!.id,
    name: "Zara",
    classification: "PRINCIPAL",
    ageGroup: "4_6",
    traits: ["corajosa"],
  });
  await db.insert(themes).values({
    universeId: universe!.id,
    title: "Coragem",
    description: "Sobre ser corajoso.",
  });
  const [provider] = await db
    .insert(aiProviders)
    .values({ provider: "stub", model: "stub-kids-v1", params: {}, fallbackOrder: 0, isActive: true })
    .returning();
  await db.insert(promptTemplates).values({
    aiProviderId: provider!.id,
    name: "tpl",
    version: 1,
    template: "Crie uma história com {{universe_title}}, tema: {{theme_title}}, semente: {{seed}}.",
    variables: ["universe_title", "theme_title", "seed"],
    isActive: true,
    createdBy: user.id,
  });
  return { user, universe: universe! };
}

describe("generateStory — reinforced-regeneration provider outage", () => {
  it("throws GENERATION_FAILED (503) when all providers fail on the reinforced retry", async () => {
    const { user, universe } = await seedReadyEnv();
    (getActiveProviders as unknown as Mock).mockResolvedValue([
      {
        row: { id: "p1", provider: "stub", model: "stub-kids-v1", params: {}, fallbackOrder: 0 },
        impl: flakyProvider,
      },
    ]);

    const actor: Actor = { id: user.id, role: "USER" };
    const err = await generateStory(actor, { universe_id: universe.id }).catch(
      (e) => e as unknown,
    );

    expect(err).toBeInstanceOf(GenerationError);
    expect((err as GenerationError).code).toBe("GENERATION_FAILED");

    // Nada persistido, quota preservada
    expect((await db.select().from(stories)).length).toBe(0);
    expect((await db.select().from(usageRecords)).length).toBe(0);
  });
});
