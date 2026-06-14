import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { resetDb, seedUser } from "../test/db.js";
import { signAccess } from "../auth/jwt.js";
import { db } from "../db/client.js";
import { universes, stories, appSettings } from "../db/schema.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb();
});

// ── helpers ─────────────────────────────────────────────────────────────────

async function seedUniverse(userId: string) {
  const [row] = await db
    .insert(universes)
    .values({
      userId,
      title: "Test Universe",
      description: "A test universe",
      visibility: "PUBLIC",
    })
    .returning();
  return row!;
}

async function seedStory(
  universeId: string,
  userId: string,
  moderationStatus: "PENDING" | "APPROVED" | "REJECTED" = "APPROVED",
) {
  const [row] = await db
    .insert(stories)
    .values({
      universeId,
      userId,
      title: `Story (${moderationStatus})`,
      content: "Once upon a time…",
      promptUsed: "test",
      moderationStatus,
    })
    .returning();
  return row!;
}

async function seedSettings(universeId: string) {
  await db.insert(appSettings).values({
    appSlug: "test-app",
    singleModeUniverseId: universeId,
    theme: {},
    featureFlags: {},
  });
}

function bearerHeader(userId: string, role: "USER" | "ADMIN" = "USER") {
  return { authorization: `Bearer ${signAccess({ sub: userId, role })}` };
}

// ── GET /api/v1/config ───────────────────────────────────────────────────────

describe("GET /api/v1/config", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/config" });
    expect(res.statusCode).toBe(401);
  });

  it("returns singleModeUniverseId when settings exist", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    await seedSettings(universe.id);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/config",
      headers: bearerHeader(admin.id, "ADMIN"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.appMode).toBe("SINGLE");
    expect(body.singleModeUniverseId).toBe(universe.id);
  });
});

// ── GET /api/v1/universes/:id/stories ────────────────────────────────────────

describe("GET /api/v1/universes/:id/stories", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/universes/00000000-0000-0000-0000-000000000001/stories",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns only APPROVED stories (not PENDING)", async () => {
    const user = await seedUser({ email: "user@x.com" });
    const universe = await seedUniverse(user.id);
    await seedStory(universe.id, user.id, "APPROVED");
    await seedStory(universe.id, user.id, "PENDING");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/stories`,
      headers: bearerHeader(user.id),
    });

    expect(res.statusCode).toBe(200);
    const list = res.json() as { id: string; title: string }[];
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe("Story (APPROVED)");
  });

  it("returns empty array for universe with no approved stories", async () => {
    const user = await seedUser({ email: "user@x.com" });
    const universe = await seedUniverse(user.id);
    await seedStory(universe.id, user.id, "PENDING");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/stories`,
      headers: bearerHeader(user.id),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(0);
  });
});

// ── GET /api/v1/stories/:id ───────────────────────────────────────────────────

describe("GET /api/v1/stories/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/stories/00000000-0000-0000-0000-000000000001",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns APPROVED story to any authenticated user", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const reader = await seedUser({ email: "reader@x.com" });
    const universe = await seedUniverse(owner.id);
    const story = await seedStory(universe.id, owner.id, "APPROVED");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/stories/${story.id}`,
      headers: bearerHeader(reader.id),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(story.id);
    expect(body.content).toBeTruthy();
  });

  it("returns 404 for PENDING story to non-owner", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const stranger = await seedUser({ email: "stranger@x.com" });
    const universe = await seedUniverse(owner.id);
    const story = await seedStory(universe.id, owner.id, "PENDING");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/stories/${story.id}`,
      headers: bearerHeader(stranger.id),
    });

    expect(res.statusCode).toBe(404);
  });

  it("owner can read their own PENDING story", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const universe = await seedUniverse(owner.id);
    const story = await seedStory(universe.id, owner.id, "PENDING");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/stories/${story.id}`,
      headers: bearerHeader(owner.id),
    });

    expect(res.statusCode).toBe(200);
  });

  it("ADMIN can read PENDING story by another user", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(owner.id);
    const story = await seedStory(universe.id, owner.id, "PENDING");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/stories/${story.id}`,
      headers: bearerHeader(admin.id, "ADMIN"),
    });

    expect(res.statusCode).toBe(200);
  });

  it("returns 404 for non-existent story id", async () => {
    const user = await seedUser({ email: "user@x.com" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/stories/00000000-0000-0000-0000-000000000001",
      headers: bearerHeader(user.id),
    });
    expect(res.statusCode).toBe(404);
  });
});
