/**
 * Integration tests for MULTI/SINGLE mode.
 *
 * Tests:
 * (a) New registered user + consent can create a universe and generate in MULTI
 *     (X-App-Slug: meu-universo) — requires TRIAL plan + meu-universo app_settings seeded.
 * (b) Regular USER in SINGLE (X-App-Slug: historias-da-gigi) gets 403 creating a universe.
 * (c) User A's universe is not in User B's /universes/mine.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { resetDb, seedUser } from "../test/db.js";
import { signAccess } from "../auth/jwt.js";
import { db } from "../db/client.js";
import {
  plans,
  subscriptions,
  appSettings,
  universes,
  characters,
  themes,
  consentRecords,
  aiProviders,
  promptTemplates,
} from "../db/schema.js";
import { TRIAL_PLAN_ID } from "../db/seedConstants.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function bearerHeader(userId: string, role: "USER" | "MODERATOR" | "ADMIN" = "USER") {
  return { authorization: `Bearer ${signAccess({ sub: userId, role })}` };
}

const MULTI_SLUG = "meu-universo";
const SINGLE_SLUG = "historias-da-gigi";

/** Seeds the MULTI app_settings row. */
async function seedMultiAppSettings() {
  await db
    .insert(appSettings)
    .values({
      id: "00000000-0000-0000-0000-000000000051",
      appSlug: MULTI_SLUG,
      appMode: "MULTI",
      singleModeUniverseId: null,
      theme: { primary: "#0F766E" },
      featureFlags: {},
    })
    .onConflictDoNothing();
}

/** Seeds the SINGLE app_settings row (without a universe, for testing purposes). */
async function seedSingleAppSettings(singleModeUniverseId: string | null = null) {
  await db
    .insert(appSettings)
    .values({
      id: "00000000-0000-0000-0000-000000000050",
      appSlug: SINGLE_SLUG,
      appMode: "SINGLE",
      singleModeUniverseId,
      theme: { primary: "#7C3AED" },
      featureFlags: {},
    })
    .onConflictDoNothing();
}

/** Seeds the TRIAL plan and returns it. */
async function seedTrialPlan() {
  await db
    .insert(plans)
    .values({
      id: TRIAL_PLAN_ID,
      name: "Trial",
      maxUniverses: 5,
      maxStoriesPerMonth: 20,
      priceCents: 0,
    })
    .onConflictDoNothing();
  return TRIAL_PLAN_ID;
}

/** Creates a TRIAL subscription for userId. */
async function seedTrialSubscription(userId: string) {
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30);
  await db.insert(subscriptions).values({
    userId,
    planId: TRIAL_PLAN_ID,
    status: "ACTIVE",
    store: "STRIPE",
    currentPeriodEnd: periodEnd,
  });
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
      variables: [
        "universe_title",
        "characters",
        "theme_title",
        "weather_condition",
        "current_time",
        "seed",
      ],
      isActive: true,
      createdBy,
    })
    .returning();
  return row!;
}

// ── (a) MULTI: new user can create universe and generate ──────────────────────

describe("(a) MULTI mode — user creates universe and generates story", () => {
  it("USER in MULTI can create universe, add character/theme, and generate", async () => {
    // Seed dependencies
    await seedMultiAppSettings();
    await seedTrialPlan();
    const user = await seedUser({ email: "multi@test.com", role: "USER" });
    await seedConsent(user.id);
    await seedTrialSubscription(user.id);
    const aiProvider = await seedAiProvider();
    await seedPromptTemplate(aiProvider.id, user.id);

    const headers = { ...bearerHeader(user.id, "USER"), "x-app-slug": MULTI_SLUG };

    // Create universe
    const uniRes = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers,
      payload: { title: "Meu Mundo", description: "Um mundo criado pelo usuário" },
    });
    expect(uniRes.statusCode).toBe(201);
    const universe = uniRes.json() as { id: string };

    // Add character
    const charRes = await app.inject({
      method: "POST",
      url: `/api/v1/universes/${universe.id}/characters`,
      headers,
      payload: { name: "Herói", classification: "PRINCIPAL" },
    });
    expect(charRes.statusCode).toBe(201);

    // Add theme
    const themeRes = await app.inject({
      method: "POST",
      url: `/api/v1/universes/${universe.id}/themes`,
      headers,
      payload: { title: "Amizade", description: "Sobre amizade" },
    });
    expect(themeRes.statusCode).toBe(201);

    // Generate story
    const genRes = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      headers,
      payload: { universe_id: universe.id },
    });
    expect(genRes.statusCode).toBe(201);
    const genBody = genRes.json() as { id: string; title: string; content: string };
    expect(genBody.id).toBeTruthy();
    expect(genBody.title).toBeTruthy();
    expect(genBody.content.length).toBeGreaterThan(10);
  });
});

// ── (b) SINGLE: regular USER cannot create universe ──────────────────────────

describe("(b) SINGLE mode — USER cannot create universe", () => {
  it("returns 403 for USER trying to create universe in SINGLE mode", async () => {
    await seedSingleAppSettings();
    const user = await seedUser({ email: "single@test.com", role: "USER" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers: {
        ...bearerHeader(user.id, "USER"),
        "x-app-slug": SINGLE_SLUG,
      },
      payload: { title: "Não deve criar", description: "Proibido" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("ADMIN in SINGLE can still create universe", async () => {
    await seedSingleAppSettings();
    const admin = await seedUser({ email: "admin@test.com", role: "ADMIN" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers: {
        ...bearerHeader(admin.id, "ADMIN"),
        "x-app-slug": SINGLE_SLUG,
      },
      payload: { title: "Admin Universe", description: "Created by admin" },
    });

    expect(res.statusCode).toBe(201);
  });
});

// ── (c) User isolation: /universes/mine ──────────────────────────────────────

describe("(c) /universes/mine — user isolation", () => {
  it("user A's universe is not visible in user B's /universes/mine", async () => {
    await seedMultiAppSettings();

    const userA = await seedUser({ email: "userA@test.com", role: "USER" });
    const userB = await seedUser({ email: "userB@test.com", role: "USER" });

    // Insert universe for user A directly
    const [universeA] = await db
      .insert(universes)
      .values({
        userId: userA.id,
        title: "Universo de A",
        description: "Pertence a A",
        visibility: "PRIVATE",
      })
      .returning();

    // Insert universe for user B directly
    const [universeB] = await db
      .insert(universes)
      .values({
        userId: userB.id,
        title: "Universo de B",
        description: "Pertence a B",
        visibility: "PRIVATE",
      })
      .returning();

    // User A's /universes/mine
    const resA = await app.inject({
      method: "GET",
      url: "/api/v1/universes/mine",
      headers: {
        ...bearerHeader(userA.id, "USER"),
        "x-app-slug": MULTI_SLUG,
      },
    });
    expect(resA.statusCode).toBe(200);
    const bodyA = resA.json() as Array<{ id: string }>;
    expect(bodyA.some((u) => u.id === universeA!.id)).toBe(true);
    expect(bodyA.some((u) => u.id === universeB!.id)).toBe(false);

    // User B's /universes/mine
    const resB = await app.inject({
      method: "GET",
      url: "/api/v1/universes/mine",
      headers: {
        ...bearerHeader(userB.id, "USER"),
        "x-app-slug": MULTI_SLUG,
      },
    });
    expect(resB.statusCode).toBe(200);
    const bodyB = resB.json() as Array<{ id: string }>;
    expect(bodyB.some((u) => u.id === universeB!.id)).toBe(true);
    expect(bodyB.some((u) => u.id === universeA!.id)).toBe(false);
  });

  it("user B cannot add characters to user A's universe in MULTI", async () => {
    await seedMultiAppSettings();
    await seedTrialPlan();

    const userA = await seedUser({ email: "userA2@test.com", role: "USER" });
    const userB = await seedUser({ email: "userB2@test.com", role: "USER" });

    // User A creates universe
    const [universeA] = await db
      .insert(universes)
      .values({
        userId: userA.id,
        title: "Só de A",
        description: "Privado",
        visibility: "PRIVATE",
      })
      .returning();

    // User B tries to add character to user A's universe
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/universes/${universeA!.id}/characters`,
      headers: {
        ...bearerHeader(userB.id, "USER"),
        "x-app-slug": MULTI_SLUG,
      },
      payload: { name: "Invasor", classification: "PRINCIPAL" },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ── SINGLE: USER lists themes/characters of the single-mode universe ──────────

describe("(d) SINGLE mode — USER lists themes/characters of the single-mode universe", () => {
  it("USER can list themes of the single-mode universe (not owner)", async () => {
    const owner = await seedUser({ email: "single-owner@test.com", role: "ADMIN" });
    const [universe] = await db
      .insert(universes)
      .values({
        userId: owner.id,
        title: "Universo do App",
        description: "Universo único do app SINGLE",
        visibility: "PRIVATE",
      })
      .returning();
    await seedSingleAppSettings(universe!.id);
    await db.insert(themes).values({
      universeId: universe!.id,
      title: "Amizade",
      description: "Sobre amizade",
    });

    const user = await seedUser({ email: "single-reader@test.com", role: "USER" });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe!.id}/themes`,
      headers: { ...bearerHeader(user.id, "USER"), "x-app-slug": SINGLE_SLUG },
    });

    expect(res.statusCode).toBe(200);
    const list = res.json() as Array<{ id: string; title: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe("Amizade");
  });

  it("USER can list characters of the single-mode universe (not owner)", async () => {
    const owner = await seedUser({ email: "single-owner2@test.com", role: "ADMIN" });
    const [universe] = await db
      .insert(universes)
      .values({
        userId: owner.id,
        title: "Universo do App",
        description: "Universo único do app SINGLE",
        visibility: "PRIVATE",
      })
      .returning();
    await seedSingleAppSettings(universe!.id);
    await db.insert(characters).values({
      universeId: universe!.id,
      name: "Herói",
      classification: "PRINCIPAL",
      traits: ["corajoso"],
    });

    const user = await seedUser({ email: "single-reader2@test.com", role: "USER" });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe!.id}/characters`,
      headers: { ...bearerHeader(user.id, "USER"), "x-app-slug": SINGLE_SLUG },
    });

    expect(res.statusCode).toBe(200);
    const list = res.json() as Array<{ id: string; name: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("Herói");
  });
});

// ── MULTI: universe access check on generation ────────────────────────────────

describe("MULTI mode — universe access check on generation", () => {
  it("user B cannot generate story in user A's universe", async () => {
    await seedMultiAppSettings();
    await seedTrialPlan();

    const userA = await seedUser({ email: "ownerA@test.com", role: "USER" });
    const userB = await seedUser({ email: "ownerB@test.com", role: "USER" });

    await seedConsent(userB.id);
    await seedTrialSubscription(userB.id);

    const aiProvider = await seedAiProvider();
    await seedPromptTemplate(aiProvider.id, userA.id);

    // Create universe owned by A
    const [universeA] = await db
      .insert(universes)
      .values({
        userId: userA.id,
        title: "Só de A",
        description: "Privado",
        visibility: "PRIVATE",
      })
      .returning();

    // Add theme (required for generation fallback)
    await db.insert(themes).values({
      universeId: universeA!.id,
      title: "Aventura",
    });

    // User B tries to generate in A's universe
    const genRes = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      headers: {
        ...bearerHeader(userB.id, "USER"),
        "x-app-slug": MULTI_SLUG,
      },
      payload: { universe_id: universeA!.id },
    });

    expect(genRes.statusCode).toBe(403);
    const body = genRes.json() as { error: { code: string } };
    expect(body.error.code).toBe("UNIVERSE_ACCESS_DENIED");
  });
});
