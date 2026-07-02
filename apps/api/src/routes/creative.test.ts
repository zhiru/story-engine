import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { resetDb, seedUser } from "../test/db.js";
import { signAccess } from "../auth/jwt.js";
import { db } from "../db/client.js";
import { plans, subscriptions } from "../db/schema.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb();
});

// ── helpers ─────────────────────────────────────────────────────────────────

function bearerHeader(userId: string, role: "USER" | "MODERATOR" | "ADMIN" = "USER") {
  return { authorization: `Bearer ${signAccess({ sub: userId, role })}` };
}

async function seedPlan(maxUniverses: number) {
  const [plan] = await db
    .insert(plans)
    .values({
      name: "Test Plan",
      maxUniverses,
      maxStoriesPerMonth: 100,
      priceCents: 0,
    })
    .returning();
  return plan!;
}

async function seedSubscription(userId: string, planId: string) {
  const periodEnd = new Date();
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  await db.insert(subscriptions).values({
    userId,
    planId,
    status: "ACTIVE",
    store: "STRIPE",
    currentPeriodEnd: periodEnd,
  });
}

// ── POST /api/v1/universes ───────────────────────────────────────────────────

describe("POST /api/v1/universes — role guard", () => {
  it("returns 403 for a regular USER", async () => {
    const user = await seedUser({ email: "user@x.com", role: "USER" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers: bearerHeader(user.id, "USER"),
      payload: { title: "My Universe", description: "A description" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      payload: { title: "My Universe", description: "A description" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 for ADMIN with valid body", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers: bearerHeader(admin.id, "ADMIN"),
      payload: { title: "Admin Universe", description: "Created by admin" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.title).toBe("Admin Universe");
  });

  it("returns 201 for MODERATOR with valid body", async () => {
    const mod = await seedUser({ email: "mod@x.com", role: "MODERATOR" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers: bearerHeader(mod.id, "MODERATOR"),
      payload: { title: "Mod Universe", description: "Created by mod" },
    });

    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for missing required fields", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers: bearerHeader(admin.id, "ADMIN"),
      payload: { title: "Only title" },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ── max_universes enforcement ─────────────────────────────────────────────────

describe("POST /api/v1/universes — max_universes limit", () => {
  it("blocks universe creation when limit reached (plan with limit 1)", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const plan = await seedPlan(1);
    await seedSubscription(admin.id, plan.id);

    // First universe: should succeed
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers: bearerHeader(admin.id, "ADMIN"),
      payload: { title: "Universe 1", description: "First" },
    });
    expect(first.statusCode).toBe(201);

    // Second universe: should be blocked (limit=1)
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers: bearerHeader(admin.id, "ADMIN"),
      payload: { title: "Universe 2", description: "Second" },
    });
    expect(second.statusCode).toBe(403);
    // Envelope padrão (SDD §7): { error: { code, message, request_id } }
    const errBody = second.json() as {
      error: { code: string; message: string; request_id: string };
    };
    expect(errBody.error.code).toBe("QUOTA_EXCEEDED");
    expect(errBody.error.message).toBe("Universe limit reached");
    expect(errBody.error.request_id).toBeTruthy();
  });

  it("allows creation when no plan subscription (no limit enforced)", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    // No subscription → getActivePlan returns null → no limit check

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers: bearerHeader(admin.id, "ADMIN"),
      payload: { title: "Free Universe", description: "No plan" },
    });

    expect(res.statusCode).toBe(201);
  });
});

// ── POST /api/v1/universes/:id/characters ─────────────────────────────────────

describe("POST /api/v1/universes/:id/characters — role guard", () => {
  it("returns 403 for regular USER", async () => {
    const user = await seedUser({ email: "user@x.com", role: "USER" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/universes/00000000-0000-0000-0000-000000000001/characters",
      headers: bearerHeader(user.id, "USER"),
      payload: { name: "Hero", classification: "PRINCIPAL" },
    });

    expect(res.statusCode).toBe(403);
  });
});
