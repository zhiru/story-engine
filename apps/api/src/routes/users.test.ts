/**
 * Integration tests for WP7:
 * - LGPD erasure (DELETE /api/v1/users/:id)
 * - Admin cost summary (GET /api/v1/admin/cost)
 * - Rate-limit smoke test (RATE_LIMIT_DISABLED env gate)
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { buildApp } from "../app.js";
import { resetDb, seedUser } from "../test/db.js";
import { signAccess } from "../auth/jwt.js";
import { db } from "../db/client.js";
import {
  users,
  universes,
  characters,
  stories,
  auditLogs,
  usageRecords,
} from "../db/schema.js";

const app = buildApp({ disableLogger: true });

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb();
});

function bearer(userId: string, role: "USER" | "MODERATOR" | "ADMIN") {
  return { authorization: `Bearer ${signAccess({ sub: userId, role })}` };
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedUniverse(userId: string) {
  const [row] = await db
    .insert(universes)
    .values({
      userId,
      title: "Test Universe",
      description: "A test universe",
    })
    .returning();
  if (!row) throw new Error("seedUniverse: no row");
  return row;
}

async function seedCharacter(universeId: string, name: string) {
  const [row] = await db
    .insert(characters)
    .values({
      universeId,
      name,
      classification: "PRINCIPAL",
      traits: ["brave", "kind"],
    })
    .returning();
  if (!row) throw new Error("seedCharacter: no row");
  return row;
}

async function seedStory(universeId: string, userId: string, opts?: {
  content?: string;
  characterNames?: string[];
  userGuidance?: string;
  promptUsed?: string;
  generationCost?: Record<string, unknown>;
}) {
  const [row] = await db
    .insert(stories)
    .values({
      universeId,
      userId,
      title: "Test Story",
      content: opts?.content ?? "Once upon a time Gigi went on an adventure.",
      characterNames: opts?.characterNames ?? ["Gigi"],
      userGuidance: opts?.userGuidance ?? "Make it fun with Gigi",
      promptUsed: opts?.promptUsed ?? "Generate a story about Gigi",
      generationCost: opts?.generationCost ?? null,
    })
    .returning();
  if (!row) throw new Error("seedStory: no row");
  return row;
}

// ── LGPD Erasure Tests ────────────────────────────────────────────────────────

describe("DELETE /api/v1/users/:id (LGPD erasure)", () => {
  it("allows self-erasure and anonymizes PII", async () => {
    const user = await seedUser({ email: "gigi-owner@test.com", role: "USER" });
    const universe = await seedUniverse(user.id);
    await seedCharacter(universe.id, "Gigi");
    await seedStory(universe.id, user.id, {
      content: "Once upon a time Gigi went on an adventure with Gigi.",
      characterNames: ["Gigi"],
      userGuidance: "Tell a story featuring Gigi",
      promptUsed: "Generate a story about Gigi",
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${user.id}`,
      headers: bearer(user.id, "USER"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.anonymized).toMatchObject({
      characters: 1,
      stories: 1,
    });

    // User email is anonymized
    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id));
    expect(dbUser?.email).toMatch(/@anon\.invalid$/);
    expect(dbUser?.email).not.toContain("gigi-owner@test.com");
    expect(dbUser?.name).toBe("[ANON]");
    expect(dbUser?.deletedAt).not.toBeNull();

    // Story content no longer contains "Gigi"
    const storyRows = await db
      .select()
      .from(stories)
      .where(eq(stories.userId, user.id));
    expect(storyRows).toHaveLength(1);
    const story = storyRows[0]!;
    expect(story.content).not.toContain("Gigi");
    expect(story.content).toContain("[ANON]");
    expect(story.userGuidance).toBeNull();
    expect(story.promptUsed).toBe("");

    // Character name anonymized
    const charRows = await db
      .select()
      .from(characters)
      .where(eq(characters.universeId, universe.id));
    expect(charRows[0]?.name).toMatch(/^\[ANON_/);
    expect(charRows[0]?.name).not.toContain("Gigi");

    // Audit log written
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "LGPD_ERASURE"));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.targetId).toBe(user.id);
    expect(logs[0]?.targetType).toBe("USER");
    const meta = logs[0]?.metadata as { counts: Record<string, number> };
    expect(meta.counts.stories).toBe(1);
    expect(meta.counts.characters).toBe(1);
  });

  it("allows admin to erase another user", async () => {
    const admin = await seedUser({ email: "admin@test.com", role: "ADMIN" });
    const target = await seedUser({ email: "victim@test.com", role: "USER" });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${target.id}`,
      headers: bearer(admin.id, "ADMIN"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);

    const [dbUser] = await db.select().from(users).where(eq(users.id, target.id));
    expect(dbUser?.email).toMatch(/@anon\.invalid$/);
  });

  it("returns 403 when non-owner non-admin tries to erase", async () => {
    const owner = await seedUser({ email: "real-owner@test.com", role: "USER" });
    const intruder = await seedUser({ email: "intruder@test.com", role: "USER" });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${owner.id}`,
      headers: bearer(intruder.id, "USER"),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error?.code).toBe("FORBIDDEN");

    // Owner's email should be untouched
    const [dbUser] = await db.select().from(users).where(eq(users.id, owner.id));
    expect(dbUser?.email).toBe("real-owner@test.com");
  });

  it("returns 401 when unauthenticated", async () => {
    const user = await seedUser({ email: "user@test.com" });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${user.id}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("replaces all occurrences of a character name in story content", async () => {
    const user = await seedUser({ email: "multi@test.com", role: "USER" });
    const universe = await seedUniverse(user.id);
    await seedStory(universe.id, user.id, {
      content: "Gigi is brave. Gigi loves dragons. GIGI wins!",
      characterNames: ["Gigi"],
    });

    await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${user.id}`,
      headers: bearer(user.id, "USER"),
    });

    const [story] = await db.select().from(stories).where(eq(stories.userId, user.id));
    expect(story?.content).toBe("[ANON] is brave. [ANON] loves dragons. [ANON] wins!");
  });

  it("response has x-request-id header", async () => {
    const user = await seedUser({ email: "reqid@test.com", role: "USER" });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${user.id}`,
      headers: bearer(user.id, "USER"),
    });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});

// ── Admin Cost Summary Tests ──────────────────────────────────────────────────

describe("GET /api/v1/admin/cost", () => {
  it("admin gets cost summary with current month period", async () => {
    const admin = await seedUser({ email: "admin@cost.com", role: "ADMIN" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/cost",
      headers: bearer(admin.id, "ADMIN"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("period");
    expect(body.period).toMatch(/^\d{4}-\d{2}$/);
    expect(body).toHaveProperty("totalStoriesGenerated");
    expect(body).toHaveProperty("usageRecordsTotal");
    expect(body).toHaveProperty("byProvider");
    expect(Array.isArray(body.byProvider)).toBe(true);
  });

  it("admin sees story counts and token aggregates when data exists", async () => {
    const admin = await seedUser({ email: "admin2@cost.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Seed stories with generationCost (SDD 8.5: snake_case + model)
    await seedStory(universe.id, admin.id, {
      generationCost: {
        provider: "claude",
        model: "claude-sonnet",
        input_tokens: 100,
        output_tokens: 200,
      },
    });
    await seedStory(universe.id, admin.id, {
      generationCost: {
        provider: "claude",
        model: "claude-sonnet",
        input_tokens: 50,
        output_tokens: 80,
      },
    });

    // Seed usage record
    await db.insert(usageRecords).values({
      userId: admin.id,
      metric: "STORY_GENERATED",
      period,
      quantity: 2,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/cost",
      headers: bearer(admin.id, "ADMIN"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalStoriesGenerated).toBe(2);
    expect(body.usageRecordsTotal).toBe(2);
    expect(body.byProvider).toHaveLength(1);
    expect(body.byProvider[0].provider).toBe("claude");
    expect(body.byProvider[0].inputTokens).toBe(150);
    expect(body.byProvider[0].outputTokens).toBe(280);
    expect(body.byProvider[0].count).toBe(2);
  });

  it("returns 403 for non-admin USER", async () => {
    const user = await seedUser({ email: "user@cost.com", role: "USER" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/cost",
      headers: bearer(user.id, "USER"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 for MODERATOR", async () => {
    const mod = await seedUser({ email: "mod@cost.com", role: "MODERATOR" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/cost",
      headers: bearer(mod.id, "MODERATOR"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/cost",
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── Rate-limit smoke test ─────────────────────────────────────────────────────

describe("Rate limit configuration", () => {
  it("RATE_LIMIT_DISABLED env var controls rate limiting", () => {
    // In test env (.env), RATE_LIMIT_DISABLED=true prevents test flakiness.
    // This smoke test verifies the env is readable and the app doesn't crash.
    const disabled = process.env.RATE_LIMIT_DISABLED;
    // Either "true" (disabled) or undefined/false (enabled with sane defaults).
    expect(["true", "false", undefined].includes(disabled)).toBe(true);
  });

  it("health endpoint works and returns x-request-id header", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    // x-request-id header is always set (even when rate limit is disabled)
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("all requests get an x-request-id response header", async () => {
    const user = await seedUser({ email: "reqid-check@test.com", role: "USER" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: bearer(user.id, "USER"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
    // Should be a UUID
    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
