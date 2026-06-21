import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../../app.js";
import { resetDb, seedUser } from "../../test/db.js";
import { signAccess } from "../../auth/jwt.js";
import { db } from "../../db/client.js";
import {
  plans,
  subscriptions,
  aiProviders,
  promptTemplates,
  appSettings,
  stories,
  universes,
  auditLogs,
} from "../../db/schema.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb();
});

// ── helpers ──────────────────────────────────────────────────────────────────

function bearer(userId: string, role: "USER" | "MODERATOR" | "ADMIN") {
  return { authorization: `Bearer ${signAccess({ sub: userId, role })}` };
}

async function seedAppSettings() {
  const [row] = await db
    .insert(appSettings)
    .values({
      appSlug: "test-app",
      appMode: "MULTI",
      theme: { primary: "#000" },
      featureFlags: { aiGeneration: true },
    })
    .returning();
  return row!;
}

async function seedPlan() {
  const [row] = await db
    .insert(plans)
    .values({
      name: "Test Plan",
      maxUniverses: 10,
      maxStoriesPerMonth: 50,
      priceCents: 999,
    })
    .returning();
  return row!;
}

async function seedAiProvider() {
  const [row] = await db
    .insert(aiProviders)
    .values({
      provider: "omniroute",
      model: "claude/claude-sonnet-4-6",
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
      template: "Tell a story about {{universe}}",
      variables: ["universe"],
      isActive: false,
      createdBy,
    })
    .returning();
  return row!;
}

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

async function seedStory(userId: string, universeId: string) {
  const [row] = await db
    .insert(stories)
    .values({
      universeId,
      userId,
      title: "Test Story",
      content: "Once upon a time...",
      promptUsed: "test/manual",
      characterNames: [],
      moderationStatus: "PENDING",
      visibility: "PRIVATE",
    })
    .returning();
  return row!;
}

// ── GET /admin/users ─────────────────────────────────────────────────────────

describe("GET /api/v1/admin/users", () => {
  it("returns 403 for non-admin USER", async () => {
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users",
      headers: bearer(user.id, "USER"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/users" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 list for ADMIN", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    await seedUser({ email: "user@x.com", role: "USER" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users",
      headers: bearer(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by email with ?q=", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    await seedUser({ email: "alice@x.com", role: "USER" });
    await seedUser({ email: "bob@x.com", role: "USER" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users?q=alice",
      headers: bearer(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBe(1);
    expect(body[0].email).toBe("alice@x.com");
  });
});

// ── PATCH /admin/users/:id ────────────────────────────────────────────────────

describe("PATCH /api/v1/admin/users/:id", () => {
  it("returns 403 for non-admin", async () => {
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${user.id}`,
      headers: bearer(user.id, "USER"),
      payload: { role: "MODERATOR" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("ADMIN can update role", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const user = await seedUser({ email: "user@x.com", role: "USER" });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${user.id}`,
      headers: bearer(admin.id, "ADMIN"),
      payload: { role: "MODERATOR" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("MODERATOR");

    // Audit log created
    const logs = await db.select().from(auditLogs);
    expect(logs.some((l) => l.action === "USER_UPDATED")).toBe(true);
  });

  it("returns 404 for unknown user", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/users/00000000-0000-0000-0000-000000000099",
      headers: bearer(admin.id, "ADMIN"),
      payload: { role: "MODERATOR" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /admin/plans ──────────────────────────────────────────────────────────

describe("GET /api/v1/admin/plans", () => {
  it("returns 403 for USER", async () => {
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/plans",
      headers: bearer(user.id, "USER"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("ADMIN can list plans", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    await seedPlan();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/plans",
      headers: bearer(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThanOrEqual(1);
  });
});

// ── POST /admin/plans ─────────────────────────────────────────────────────────

describe("POST /api/v1/admin/plans", () => {
  it("ADMIN can create a plan", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/plans",
      headers: bearer(admin.id, "ADMIN"),
      payload: {
        name: "Premium",
        maxUniverses: 20,
        maxStoriesPerMonth: 100,
        priceCents: 999,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("Premium");
    expect(body.priceCents).toBe(999);
  });

  it("returns 400 for missing required fields", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/plans",
      headers: bearer(admin.id, "ADMIN"),
      payload: { name: "Incomplete" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── PATCH /admin/plans/:id ────────────────────────────────────────────────────

describe("PATCH /api/v1/admin/plans/:id", () => {
  it("ADMIN can update a plan", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const plan = await seedPlan();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/plans/${plan.id}`,
      headers: bearer(admin.id, "ADMIN"),
      payload: { name: "Updated Plan", priceCents: 1999 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Updated Plan");
  });
});

// ── DELETE /admin/plans/:id ───────────────────────────────────────────────────

describe("DELETE /api/v1/admin/plans/:id", () => {
  it("ADMIN can soft-delete a plan", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const plan = await seedPlan();

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/plans/${plan.id}`,
      headers: bearer(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    // Plan should no longer appear in list
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/plans",
      headers: bearer(admin.id, "ADMIN"),
    });
    const plans_list = listRes.json();
    expect(plans_list.find((p: { id: string }) => p.id === plan.id)).toBeUndefined();
  });
});

// ── POST /reports (any authed user) ──────────────────────────────────────────

describe("POST /api/v1/reports", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports",
      payload: { targetType: "STORY", targetId: "00000000-0000-0000-0000-000000000001", reason: "Bad content" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("regular USER can submit a report", async () => {
    const user = await seedUser({ email: "user@x.com", role: "USER" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports",
      headers: bearer(user.id, "USER"),
      payload: {
        targetType: "STORY",
        targetId: "00000000-0000-0000-0000-000000000001",
        reason: "Inappropriate content",
        details: "Contains scary scenes",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.reporterId).toBe(user.id);
    expect(body.status).toBe("OPEN");
  });

  it("returns 400 for invalid targetType", async () => {
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/reports",
      headers: bearer(user.id, "USER"),
      payload: {
        targetType: "INVALID",
        targetId: "00000000-0000-0000-0000-000000000001",
        reason: "Bad",
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── GET /admin/reports ────────────────────────────────────────────────────────

describe("GET /api/v1/admin/reports", () => {
  it("returns 403 for regular USER", async () => {
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/reports",
      headers: bearer(user.id, "USER"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("ADMIN can list reports", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const user = await seedUser({ email: "user@x.com", role: "USER" });

    // Create a report
    await app.inject({
      method: "POST",
      url: "/api/v1/reports",
      headers: bearer(user.id, "USER"),
      payload: {
        targetType: "UNIVERSE",
        targetId: "00000000-0000-0000-0000-000000000001",
        reason: "Spam",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/reports",
      headers: bearer(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(1);
  });

  it("MODERATOR can list reports", async () => {
    const mod = await seedUser({ email: "mod@x.com", role: "MODERATOR" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/reports",
      headers: bearer(mod.id, "MODERATOR"),
    });
    expect(res.statusCode).toBe(200);
  });
});

// ── PATCH /admin/reports/:id — story → REJECTED ───────────────────────────────

describe("PATCH /api/v1/admin/reports/:id", () => {
  it("ADMIN can action a report and story becomes REJECTED", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const universe = await seedUniverse(user.id);
    const story = await seedStory(user.id, universe.id);

    // Submit report targeting the story
    const reportRes = await app.inject({
      method: "POST",
      url: "/api/v1/reports",
      headers: bearer(user.id, "USER"),
      payload: {
        targetType: "STORY",
        targetId: story.id,
        reason: "Inappropriate",
      },
    });
    expect(reportRes.statusCode).toBe(201);
    const report = reportRes.json();

    // Admin actions it
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/reports/${report.id}`,
      headers: bearer(admin.id, "ADMIN"),
      payload: { status: "ACTIONED" },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().status).toBe("ACTIONED");

    // Story should now be REJECTED
    const [updatedStory] = await db
      .select({ moderationStatus: stories.moderationStatus })
      .from(stories)
      ;
    expect(updatedStory?.moderationStatus).toBe("REJECTED");

    // Audit log written
    const logs = await db.select().from(auditLogs);
    expect(logs.some((l) => l.action === "REPORT_ACTIONED")).toBe(true);
  });

  it("returns 404 for unknown report", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/reports/00000000-0000-0000-0000-000000000099",
      headers: bearer(admin.id, "ADMIN"),
      payload: { status: "DISMISSED" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /admin/app-settings ───────────────────────────────────────────────────

describe("GET /api/v1/admin/app-settings", () => {
  it("returns 403 for USER", async () => {
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/app-settings",
      headers: bearer(user.id, "USER"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("ADMIN can list app settings", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    await seedAppSettings();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/app-settings",
      headers: bearer(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThanOrEqual(1);
  });
});

// ── PATCH /admin/app-settings/:slug ──────────────────────────────────────────

describe("PATCH /api/v1/admin/app-settings/:slug", () => {
  it("ADMIN can update app settings", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    await seedAppSettings();

    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/app-settings/test-app",
      headers: bearer(admin.id, "ADMIN"),
      payload: { appMode: "SINGLE", theme: { primary: "#FF0000" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().appMode).toBe("SINGLE");

    // Audit log
    const logs = await db.select().from(auditLogs);
    expect(logs.some((l) => l.action === "APP_SETTINGS_UPDATED")).toBe(true);
  });

  it("returns 404 for unknown slug", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/app-settings/nonexistent",
      headers: bearer(admin.id, "ADMIN"),
      payload: { appMode: "SINGLE" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /admin/audit ──────────────────────────────────────────────────────────

describe("GET /api/v1/admin/audit", () => {
  it("returns 403 for USER", async () => {
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit",
      headers: bearer(user.id, "USER"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("ADMIN can list audit logs", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const user = await seedUser({ email: "user@x.com", role: "USER" });

    // Trigger some audit entries via PATCH user
    await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${user.id}`,
      headers: bearer(admin.id, "ADMIN"),
      payload: { role: "MODERATOR" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit",
      headers: bearer(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it("filters by ?action=", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const user = await seedUser({ email: "user@x.com", role: "USER" });

    await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${user.id}`,
      headers: bearer(admin.id, "ADMIN"),
      payload: { role: "MODERATOR" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit?action=USER_UPDATED",
      headers: bearer(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.every((l: { action: string }) => l.action === "USER_UPDATED")).toBe(true);
  });
});

// ── GET /admin/prompt-templates ───────────────────────────────────────────────

describe("GET /api/v1/admin/prompt-templates", () => {
  it("returns 403 for USER", async () => {
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/prompt-templates",
      headers: bearer(user.id, "USER"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("ADMIN can list prompt templates", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const provider = await seedAiProvider();
    await seedPromptTemplate(provider.id, admin.id);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/prompt-templates",
      headers: bearer(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(1);
  });
});

// ── POST /admin/prompt-templates ──────────────────────────────────────────────

describe("POST /api/v1/admin/prompt-templates", () => {
  it("ADMIN can create a new prompt template (inactive)", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const provider = await seedAiProvider();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/prompt-templates",
      headers: bearer(admin.id, "ADMIN"),
      payload: {
        aiProviderId: provider.id,
        name: "kids-story-v2",
        template: "New template text {{universe}}",
        variables: ["universe"],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.isActive).toBe(false);
    expect(body.version).toBe(1);
  });

  it("increments version for same provider", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const provider = await seedAiProvider();
    await seedPromptTemplate(provider.id, admin.id); // version 1

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/prompt-templates",
      headers: bearer(admin.id, "ADMIN"),
      payload: {
        aiProviderId: provider.id,
        name: "kids-story-v2",
        template: "Version 2 template",
        variables: [],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().version).toBe(2);
  });
});

// ── PATCH /admin/prompt-templates/:id — activate deactivates siblings ─────────

describe("PATCH /api/v1/admin/prompt-templates/:id", () => {
  it("activating a template deactivates siblings for same provider", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const provider = await seedAiProvider();

    // Create template v1 (active)
    const [t1] = await db
      .insert(promptTemplates)
      .values({
        aiProviderId: provider.id,
        name: "v1",
        version: 1,
        template: "v1 text",
        variables: [],
        isActive: true,
        createdBy: admin.id,
      })
      .returning();

    // Create template v2 (inactive)
    const [t2] = await db
      .insert(promptTemplates)
      .values({
        aiProviderId: provider.id,
        name: "v2",
        version: 2,
        template: "v2 text",
        variables: [],
        isActive: false,
        createdBy: admin.id,
      })
      .returning();

    // Activate v2
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/prompt-templates/${t2!.id}`,
      headers: bearer(admin.id, "ADMIN"),
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().isActive).toBe(true);

    // v1 should now be inactive
    const [updatedT1] = await db
      .select({ isActive: promptTemplates.isActive })
      .from(promptTemplates)
      ;
    // Find t1 specifically
    const allTemplates = await db.select().from(promptTemplates);
    const updT1 = allTemplates.find((t) => t.id === t1!.id);
    const updT2 = allTemplates.find((t) => t.id === t2!.id);
    expect(updT1?.isActive).toBe(false);
    expect(updT2?.isActive).toBe(true);

    // Audit log with PROMPT_TEMPLATE_ACTIVATED
    const logs = await db.select().from(auditLogs);
    expect(logs.some((l) => l.action === "PROMPT_TEMPLATE_ACTIVATED")).toBe(true);
  });

  it("returns 404 for unknown template", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/prompt-templates/00000000-0000-0000-0000-000000000099",
      headers: bearer(admin.id, "ADMIN"),
      payload: { name: "updated" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /admin/ai-providers ───────────────────────────────────────────────────

describe("GET /api/v1/admin/ai-providers", () => {
  it("returns 403 for USER", async () => {
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/ai-providers",
      headers: bearer(user.id, "USER"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("ADMIN can list AI providers", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    await seedAiProvider();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/ai-providers",
      headers: bearer(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThanOrEqual(1);
  });
});

// ── PATCH /admin/ai-providers/:id ────────────────────────────────────────────

describe("PATCH /api/v1/admin/ai-providers/:id", () => {
  it("ADMIN can update AI provider", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const provider = await seedAiProvider();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/ai-providers/${provider.id}`,
      headers: bearer(admin.id, "ADMIN"),
      payload: { model: "claude/claude-opus-4-5", fallbackOrder: 1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().model).toBe("claude/claude-opus-4-5");

    // Audit log
    const logs = await db.select().from(auditLogs);
    expect(logs.some((l) => l.action === "AI_PROVIDER_UPDATED")).toBe(true);
  });

  it("returns 403 for USER", async () => {
    const user = await seedUser({ email: "user@x.com", role: "USER" });
    const provider = await seedAiProvider();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/ai-providers/${provider.id}`,
      headers: bearer(user.id, "USER"),
      payload: { model: "evil-model" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 for unknown provider", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/ai-providers/00000000-0000-0000-0000-000000000099",
      headers: bearer(admin.id, "ADMIN"),
      payload: { model: "updated" },
    });
    expect(res.statusCode).toBe(404);
  });
});
