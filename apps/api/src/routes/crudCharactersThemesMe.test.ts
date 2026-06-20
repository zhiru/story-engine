/**
 * Integration tests for:
 *   GET    /api/v1/universes/:id/characters
 *   PATCH  /api/v1/universes/:id/characters/:cid
 *   DELETE /api/v1/universes/:id/characters/:cid
 *   GET    /api/v1/universes/:id/themes
 *   PATCH  /api/v1/universes/:id/themes/:tid
 *   DELETE /api/v1/universes/:id/themes/:tid
 *   GET    /api/v1/me
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { resetDb, seedUser } from "../test/db.js";
import { signAccess } from "../auth/jwt.js";
import { db } from "../db/client.js";
import { universes, characters, themes, appSettings } from "../db/schema.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeader(userId: string, role: "USER" | "MODERATOR" | "ADMIN" = "USER") {
  return { authorization: `Bearer ${signAccess({ sub: userId, role })}` };
}

const MULTI_SLUG = "test-multi";
const SINGLE_SLUG = "test-single";

async function seedMultiApp() {
  await db.insert(appSettings).values({
    appSlug: MULTI_SLUG,
    appMode: "MULTI",
    theme: {},
    featureFlags: {},
  }).onConflictDoNothing();
}

async function seedSingleApp() {
  await db.insert(appSettings).values({
    appSlug: SINGLE_SLUG,
    appMode: "SINGLE",
    theme: {},
    featureFlags: {},
  }).onConflictDoNothing();
}

async function seedUniverse(userId: string) {
  const [row] = await db
    .insert(universes)
    .values({ userId, title: "Test Universe", description: "Desc", visibility: "PRIVATE" })
    .returning();
  return row!;
}

async function seedCharacter(universeId: string) {
  const [row] = await db
    .insert(characters)
    .values({ universeId, name: "Hero", classification: "PRINCIPAL", traits: [] })
    .returning();
  return row!;
}

async function seedTheme(universeId: string) {
  const [row] = await db
    .insert(themes)
    .values({ universeId, title: "Friendship" })
    .returning();
  return row!;
}

// ── GET /characters ───────────────────────────────────────────────────────────

describe("GET /api/v1/universes/:id/characters", () => {
  it("ADMIN can list characters", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    await seedCharacter(universe.id);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/characters`,
      headers: authHeader(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ name: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]!.name).toBe("Hero");
  });

  it("USER in MULTI can list characters from their own universe", async () => {
    await seedMultiApp();
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const universe = await seedUniverse(user.id);
    await seedCharacter(universe.id);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/characters`,
      headers: { ...authHeader(user.id, "USER"), "x-app-slug": MULTI_SLUG },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ name: string }>;
    expect(body).toHaveLength(1);
  });

  it("USER in SINGLE gets 403", async () => {
    await seedSingleApp();
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/characters`,
      headers: { ...authHeader(user.id, "USER"), "x-app-slug": SINGLE_SLUG },
    });
    expect(res.statusCode).toBe(403);
  });

  it("USER in MULTI gets 403 on another user's universe", async () => {
    await seedMultiApp();
    const owner = await seedUser({ email: "owner@x.com", role: "USER" });
    const other = await seedUser({ email: "other@x.com", role: "USER" });
    const universe = await seedUniverse(owner.id);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/characters`,
      headers: { ...authHeader(other.id, "USER"), "x-app-slug": MULTI_SLUG },
    });
    expect(res.statusCode).toBe(403);
  });

  it("excludes soft-deleted characters", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    const char = await seedCharacter(universe.id);

    // Soft-delete it
    await db.update(characters).set({ deletedAt: new Date() }).where(
      // drizzle eq import already in scope in prod file; we query the same way
      (await import("drizzle-orm")).eq(characters.id, char.id),
    );

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/characters`,
      headers: authHeader(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(0);
  });
});

// ── PATCH /characters/:cid ────────────────────────────────────────────────────

describe("PATCH /api/v1/universes/:id/characters/:cid", () => {
  it("ADMIN can update a character", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    const char = await seedCharacter(universe.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${universe.id}/characters/${char.id}`,
      headers: authHeader(admin.id, "ADMIN"),
      payload: { name: "Updated Hero" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ name: string }>().name).toBe("Updated Hero");
  });

  it("USER in MULTI can update their own character", async () => {
    await seedMultiApp();
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const universe = await seedUniverse(user.id);
    const char = await seedCharacter(universe.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${universe.id}/characters/${char.id}`,
      headers: { ...authHeader(user.id, "USER"), "x-app-slug": MULTI_SLUG },
      payload: { name: "New Name" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ name: string }>().name).toBe("New Name");
  });

  it("USER in SINGLE gets 403", async () => {
    await seedSingleApp();
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    const char = await seedCharacter(universe.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${universe.id}/characters/${char.id}`,
      headers: { ...authHeader(user.id, "USER"), "x-app-slug": SINGLE_SLUG },
      payload: { name: "Hacked" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 for character in wrong universe", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe1 = await seedUniverse(admin.id);
    const universe2 = await seedUniverse(admin.id);
    const char = await seedCharacter(universe1.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${universe2.id}/characters/${char.id}`,
      headers: authHeader(admin.id, "ADMIN"),
      payload: { name: "Wrong Universe" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── DELETE /characters/:cid ───────────────────────────────────────────────────

describe("DELETE /api/v1/universes/:id/characters/:cid", () => {
  it("ADMIN can soft-delete a character; list then excludes it", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    const char = await seedCharacter(universe.id);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/universes/${universe.id}/characters/${char.id}`,
      headers: authHeader(admin.id, "ADMIN"),
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json()).toEqual({ ok: true });

    // List should now be empty
    const listRes = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/characters`,
      headers: authHeader(admin.id, "ADMIN"),
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toHaveLength(0);
  });

  it("USER in SINGLE gets 403 on delete", async () => {
    await seedSingleApp();
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    const char = await seedCharacter(universe.id);

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/universes/${universe.id}/characters/${char.id}`,
      headers: { ...authHeader(user.id, "USER"), "x-app-slug": SINGLE_SLUG },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 when character already soft-deleted", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    const char = await seedCharacter(universe.id);

    // First delete
    await app.inject({
      method: "DELETE",
      url: `/api/v1/universes/${universe.id}/characters/${char.id}`,
      headers: authHeader(admin.id, "ADMIN"),
    });

    // Second delete — should 404
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/universes/${universe.id}/characters/${char.id}`,
      headers: authHeader(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /themes ───────────────────────────────────────────────────────────────

describe("GET /api/v1/universes/:id/themes", () => {
  it("ADMIN can list themes", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    await seedTheme(universe.id);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/themes`,
      headers: authHeader(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ title: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]!.title).toBe("Friendship");
  });

  it("USER in MULTI can list themes from their own universe", async () => {
    await seedMultiApp();
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const universe = await seedUniverse(user.id);
    await seedTheme(universe.id);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/themes`,
      headers: { ...authHeader(user.id, "USER"), "x-app-slug": MULTI_SLUG },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it("USER in SINGLE gets 403", async () => {
    await seedSingleApp();
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/themes`,
      headers: { ...authHeader(user.id, "USER"), "x-app-slug": SINGLE_SLUG },
    });
    expect(res.statusCode).toBe(403);
  });

  it("excludes soft-deleted themes", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    const theme = await seedTheme(universe.id);

    await db.update(themes).set({ deletedAt: new Date() }).where(
      (await import("drizzle-orm")).eq(themes.id, theme.id),
    );

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/themes`,
      headers: authHeader(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(0);
  });
});

// ── PATCH /themes/:tid ────────────────────────────────────────────────────────

describe("PATCH /api/v1/universes/:id/themes/:tid", () => {
  it("ADMIN can update a theme", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    const theme = await seedTheme(universe.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${universe.id}/themes/${theme.id}`,
      headers: authHeader(admin.id, "ADMIN"),
      payload: { title: "Updated Theme", description: "New desc" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ title: string; description: string }>();
    expect(body.title).toBe("Updated Theme");
    expect(body.description).toBe("New desc");
  });

  it("USER in MULTI can update their own theme", async () => {
    await seedMultiApp();
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const universe = await seedUniverse(user.id);
    const theme = await seedTheme(universe.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${universe.id}/themes/${theme.id}`,
      headers: { ...authHeader(user.id, "USER"), "x-app-slug": MULTI_SLUG },
      payload: { title: "User Updated" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ title: string }>().title).toBe("User Updated");
  });

  it("USER in SINGLE gets 403", async () => {
    await seedSingleApp();
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    const theme = await seedTheme(universe.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${universe.id}/themes/${theme.id}`,
      headers: { ...authHeader(user.id, "USER"), "x-app-slug": SINGLE_SLUG },
      payload: { title: "Hacked" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 for theme in wrong universe", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe1 = await seedUniverse(admin.id);
    const universe2 = await seedUniverse(admin.id);
    const theme = await seedTheme(universe1.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${universe2.id}/themes/${theme.id}`,
      headers: authHeader(admin.id, "ADMIN"),
      payload: { title: "Wrong" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── DELETE /themes/:tid ───────────────────────────────────────────────────────

describe("DELETE /api/v1/universes/:id/themes/:tid", () => {
  it("ADMIN can soft-delete a theme; list then excludes it", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    const theme = await seedTheme(universe.id);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/universes/${universe.id}/themes/${theme.id}`,
      headers: authHeader(admin.id, "ADMIN"),
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json()).toEqual({ ok: true });

    const listRes = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/themes`,
      headers: authHeader(admin.id, "ADMIN"),
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toHaveLength(0);
  });

  it("USER in SINGLE gets 403 on delete", async () => {
    await seedSingleApp();
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    const theme = await seedTheme(universe.id);

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/universes/${universe.id}/themes/${theme.id}`,
      headers: { ...authHeader(user.id, "USER"), "x-app-slug": SINGLE_SLUG },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── GET /me ───────────────────────────────────────────────────────────────────

describe("GET /api/v1/me", () => {
  it("returns id, email, role for authenticated user", async () => {
    const user = await seedUser({ email: "user@example.com", role: "USER" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: authHeader(user.id, "USER"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; email: string; role: string }>();
    expect(body.id).toBe(user.id);
    expect(body.email).toBe("user@example.com");
    expect(body.role).toBe("USER");
  });

  it("returns ADMIN role correctly", async () => {
    const admin = await seedUser({ email: "admin@example.com", role: "ADMIN" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: authHeader(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ role: string }>().role).toBe("ADMIN");
  });

  it("returns MODERATOR role correctly", async () => {
    const mod = await seedUser({ email: "mod@example.com", role: "MODERATOR" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: authHeader(mod.id, "MODERATOR"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ role: string }>().role).toBe("MODERATOR");
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
    });
    expect(res.statusCode).toBe(401);
  });
});
