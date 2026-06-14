import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { resetDb, seedUser } from "../test/db.js";
import { signAccess } from "../auth/jwt.js";
import { db } from "../db/client.js";
import {
  universes,
  characters,
  themes,
  storyArcs,
  stories,
  plans,
  subscriptions,
  consentRecords,
  aiProviders,
  promptTemplates,
  usageRecords,
} from "../db/schema.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb();
});

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedPlan(maxStoriesPerMonth = 10) {
  const [row] = await db
    .insert(plans)
    .values({
      name: "Test Plan",
      maxUniverses: 10,
      maxStoriesPerMonth,
      priceCents: 0,
    })
    .returning();
  return row!;
}

async function seedActiveSubscription(userId: string, planId: string) {
  const periodEnd = new Date();
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  const [row] = await db
    .insert(subscriptions)
    .values({
      userId,
      planId,
      status: "ACTIVE",
      store: "STRIPE",
      currentPeriodEnd: periodEnd,
    })
    .returning();
  return row!;
}

async function seedConsent(userId: string) {
  await db.insert(consentRecords).values({
    userId,
    consentType: "PARENTAL_DATA",
    policyVersion: "1.0",
    granted: true,
    ipAddress: "127.0.0.1",
  });
}

async function seedUniverse(userId: string) {
  const [row] = await db
    .insert(universes)
    .values({
      userId,
      title: "Mundo do Teste",
      description: "Um universo de teste.",
      visibility: "PRIVATE",
    })
    .returning();
  return row!;
}

async function seedCharacters(universeId: string) {
  const [principal] = await db
    .insert(characters)
    .values({
      universeId,
      name: "Zara",
      classification: "PRINCIPAL",
      ageGroup: "4_6",
      traits: ["corajosa", "gentil"],
    })
    .returning();

  const [mascot] = await db
    .insert(characters)
    .values({
      universeId,
      name: "Kiko",
      classification: "MASCOTE",
      ageGroup: "4_6",
      traits: ["brincalhão"],
    })
    .returning();

  return [principal!, mascot!];
}

async function seedTheme(universeId: string) {
  const [row] = await db
    .insert(themes)
    .values({
      universeId,
      title: "Coragem",
      description: "Sobre ser corajoso.",
    })
    .returning();
  return row!;
}

async function seedAiProvider() {
  const [row] = await db
    .insert(aiProviders)
    .values({
      provider: "stub",
      model: "stub-kids-v1",
      params: {},
      fallbackOrder: 0,
      isActive: true,
    })
    .returning();
  return row!;
}

async function seedPromptTemplate(aiProviderId: string, createdBy: string) {
  const [row] = await db
    .insert(promptTemplates)
    .values({
      aiProviderId,
      name: "test-template",
      version: 1,
      template:
        "Crie uma história com {{universe_title}}, personagens: {{characters}}, tema: {{theme_title}}, clima: {{weather_condition}}, hora: {{current_time}}, semente: {{seed}}.",
      variables: ["universe_title", "characters", "theme_title", "weather_condition", "current_time", "seed"],
      isActive: true,
      createdBy,
    })
    .returning();
  return row!;
}

async function seedStoryArc(universeId: string) {
  const [row] = await db
    .insert(storyArcs)
    .values({
      universeId,
      title: "Grande Jornada",
      summary: "A aventura começou no bosque.",
      version: 1,
      isActive: true,
    })
    .returning();
  return row!;
}

/**
 * Seeds a complete ready-to-generate environment.
 * Returns all seeded entities.
 */
async function seedFullEnv(options: { maxStories?: number } = {}) {
  const user = await seedUser({ email: "gen@test.com" });
  await seedConsent(user.id);
  const plan = await seedPlan(options.maxStories ?? 10);
  await seedActiveSubscription(user.id, plan.id);
  const universe = await seedUniverse(user.id);
  await seedCharacters(universe.id);
  await seedTheme(universe.id);
  const aiProvider = await seedAiProvider();
  await seedPromptTemplate(aiProvider.id, user.id);
  return { user, universe, plan };
}

function bearerHeader(userId: string, role: "USER" | "ADMIN" = "USER") {
  return { authorization: `Bearer ${signAccess({ sub: userId, role })}` };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/v1/stories/generate", () => {
  it("happy path: generates and persists an APPROVED story", async () => {
    const { user, universe } = await seedFullEnv();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      headers: bearerHeader(user.id),
      payload: { universe_id: universe.id },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      id: string;
      title: string;
      content: string;
      metadata_weather: object;
    };
    expect(body.id).toBeTruthy();
    expect(body.title).toBeTruthy();
    expect(body.content.length).toBeGreaterThan(50);
    expect(body.metadata_weather).toBeTruthy();

    // Verify persisted in DB
    const [dbStory] = await db
      .select()
      .from(stories)
      .limit(1);
    // Verify story exists and is APPROVED
    expect(dbStory).toBeTruthy();
    expect(dbStory!.moderationStatus).toBe("APPROVED");
    expect(dbStory!.userId).toBe(user.id);
    expect(dbStory!.universeId).toBe(universe.id);
    expect(Array.isArray(dbStory!.characterNames)).toBe(true);
    expect(dbStory!.characterNames.length).toBeGreaterThan(0);
    expect(dbStory!.metadataWeather).toBeTruthy();

    // Verify usage_records +1
    const [usage] = await db.select().from(usageRecords).limit(1);
    expect(usage).toBeTruthy();
    expect(usage!.metric).toBe("STORY_GENERATED");
    expect(usage!.userId).toBe(user.id);
  });

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      payload: { universe_id: "00000000-0000-0000-0000-000000000001" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 when user has no consent", async () => {
    const user = await seedUser({ email: "noconsent@test.com" });
    const plan = await seedPlan();
    await seedActiveSubscription(user.id, plan.id);
    const universe = await seedUniverse(user.id);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      headers: bearerHeader(user.id),
      payload: { universe_id: universe.id },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 NO_ACTIVE_SUBSCRIPTION when user has no subscription", async () => {
    const user = await seedUser({ email: "nosub@test.com" });
    await seedConsent(user.id);
    const universe = await seedUniverse(user.id);
    await seedAiProvider();
    // No subscription seeded

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      headers: bearerHeader(user.id),
      payload: { universe_id: universe.id },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.code).toBe("NO_ACTIVE_SUBSCRIPTION");
  });

  it("returns 402 QUOTA_EXCEEDED when monthly limit reached", async () => {
    const { user, universe } = await seedFullEnv({ maxStories: 1 });

    // Generate first story (should succeed)
    const res1 = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      headers: bearerHeader(user.id),
      payload: { universe_id: universe.id },
    });
    expect(res1.statusCode).toBe(201);

    // Second generation should hit quota
    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      headers: bearerHeader(user.id),
      payload: { universe_id: universe.id },
    });
    expect(res2.statusCode).toBe(402);
    const body = res2.json();
    expect(body.error.code).toBe("QUOTA_EXCEEDED");

    // Verify no extra story was persisted
    const allStories = await db.select().from(stories);
    expect(allStories.length).toBe(1);
  });

  it("returns 422 CONTENT_REJECTED when user_guidance contains blocked term", async () => {
    const { user, universe } = await seedFullEnv();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      headers: bearerHeader(user.id),
      payload: {
        universe_id: universe.id,
        user_guidance: "faça a personagem matar o vilão com sangue",
      },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe("CONTENT_REJECTED");

    // Verify quota NOT consumed (no usage record)
    const usageRows = await db.select().from(usageRecords);
    expect(usageRows.length).toBe(0);

    // Verify no story was persisted
    const allStories = await db.select().from(stories);
    expect(allStories.length).toBe(0);
  });

  it("CONTINUOUS: generates chapter and updates arc summary (version+1)", async () => {
    const { user, universe } = await seedFullEnv();
    const arc = await seedStoryArc(universe.id);

    expect(arc.version).toBe(1);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      headers: bearerHeader(user.id),
      payload: {
        universe_id: universe.id,
        story_arc_id: arc.id,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { story_arc_id: string };
    expect(body.story_arc_id).toBe(arc.id);

    // Verify arc summary was updated
    const [updatedArc] = await db
      .select()
      .from(storyArcs)
      .limit(1);
    expect(updatedArc).toBeTruthy();
    expect(updatedArc!.version).toBe(2);
    expect(updatedArc!.summary).toBeTruthy();
    expect(updatedArc!.summary).not.toBe("A aventura começou no bosque.");
  });

  it("returns 400 for missing universe_id", async () => {
    const { user } = await seedFullEnv();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      headers: bearerHeader(user.id),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
