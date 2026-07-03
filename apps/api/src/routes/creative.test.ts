import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { resetDb, seedUser } from "../test/db.js";
import { signAccess } from "../auth/jwt.js";
import { db } from "../db/client.js";
import { eq } from "drizzle-orm";
import {
  plans,
  subscriptions,
  appSettings,
  universes,
  characters,
  themes,
  storyArcs,
} from "../db/schema.js";

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

const MULTI_SLUG = "test-multi";
const SINGLE_SLUG = "test-single";

async function seedMultiApp() {
  await db
    .insert(appSettings)
    .values({ appSlug: MULTI_SLUG, appMode: "MULTI", theme: {}, featureFlags: {} })
    .onConflictDoNothing();
}

async function seedSingleApp() {
  await db
    .insert(appSettings)
    .values({ appSlug: SINGLE_SLUG, appMode: "SINGLE", theme: {}, featureFlags: {} })
    .onConflictDoNothing();
}

async function seedUniverse(
  userId: string,
  overrides: Partial<typeof universes.$inferInsert> = {},
) {
  const [row] = await db
    .insert(universes)
    .values({
      userId,
      title: "Universo Teste",
      description: "Descrição",
      visibility: "PRIVATE",
      ...overrides,
    })
    .returning();
  return row!;
}

async function seedArc(universeId: string, title = "Arco 1") {
  const [row] = await db
    .insert(storyArcs)
    .values({ universeId, title, summary: "Resumo inicial" })
    .returning();
  return row!;
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

// ═════ Creative CRUD (WP-C) ═══════════════════════════════════════════════════

// ── GET /api/v1/universes/:id — persona matrix ────────────────────────────────

describe("GET /api/v1/universes/:id — persona matrix", () => {
  it("MULTI: owner 200, stranger 403, admin 200, anon 401", async () => {
    await seedMultiApp();
    const owner = await seedUser({ email: "owner@x.com", role: "USER" });
    const stranger = await seedUser({ email: "stranger@x.com", role: "USER" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(owner.id);

    const url = `/api/v1/universes/${universe.id}`;
    const slug = { "x-app-slug": MULTI_SLUG };

    const ownerRes = await app.inject({ method: "GET", url, headers: { ...bearerHeader(owner.id), ...slug } });
    expect(ownerRes.statusCode).toBe(200);
    expect((ownerRes.json() as { id: string }).id).toBe(universe.id);

    const strangerRes = await app.inject({ method: "GET", url, headers: { ...bearerHeader(stranger.id), ...slug } });
    expect(strangerRes.statusCode).toBe(403);

    const adminRes = await app.inject({ method: "GET", url, headers: { ...bearerHeader(admin.id, "ADMIN"), ...slug } });
    expect(adminRes.statusCode).toBe(200);

    const anonRes = await app.inject({ method: "GET", url, headers: slug });
    expect(anonRes.statusCode).toBe(401);
  });

  it("SINGLE: owner 200, stranger 403 (privado), admin 200, anon 401", async () => {
    await seedSingleApp();
    const owner = await seedUser({ email: "owner@x.com", role: "USER" });
    const stranger = await seedUser({ email: "stranger@x.com", role: "USER" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(owner.id);

    const url = `/api/v1/universes/${universe.id}`;
    const slug = { "x-app-slug": SINGLE_SLUG };

    expect((await app.inject({ method: "GET", url, headers: { ...bearerHeader(owner.id), ...slug } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url, headers: { ...bearerHeader(stranger.id), ...slug } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url, headers: { ...bearerHeader(admin.id, "ADMIN"), ...slug } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url, headers: slug })).statusCode).toBe(401);
  });

  it("PUBLIC universe is readable by stranger", async () => {
    await seedMultiApp();
    const owner = await seedUser({ email: "owner@x.com", role: "USER" });
    const stranger = await seedUser({ email: "stranger@x.com", role: "USER" });
    const universe = await seedUniverse(owner.id, { visibility: "PUBLIC" });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}`,
      headers: { ...bearerHeader(stranger.id), "x-app-slug": MULTI_SLUG },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 for unknown universe", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/universes/00000000-0000-0000-0000-000000000099",
      headers: bearerHeader(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── PATCH /api/v1/universes/:id — persona matrix ──────────────────────────────

describe("PATCH /api/v1/universes/:id — persona matrix", () => {
  it("MULTI: owner 200, stranger 403, admin 200, anon 401", async () => {
    await seedMultiApp();
    const owner = await seedUser({ email: "owner@x.com", role: "USER" });
    const stranger = await seedUser({ email: "stranger@x.com", role: "USER" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(owner.id);

    const url = `/api/v1/universes/${universe.id}`;
    const slug = { "x-app-slug": MULTI_SLUG };

    const ownerRes = await app.inject({
      method: "PATCH",
      url,
      headers: { ...bearerHeader(owner.id), ...slug },
      payload: { title: "Novo título" },
    });
    expect(ownerRes.statusCode).toBe(200);
    expect((ownerRes.json() as { title: string }).title).toBe("Novo título");

    const strangerRes = await app.inject({
      method: "PATCH",
      url,
      headers: { ...bearerHeader(stranger.id), ...slug },
      payload: { title: "Invasão" },
    });
    expect(strangerRes.statusCode).toBe(403);

    const adminRes = await app.inject({
      method: "PATCH",
      url,
      headers: { ...bearerHeader(admin.id, "ADMIN"), ...slug },
      payload: { visibility: "PUBLIC" },
    });
    expect(adminRes.statusCode).toBe(200);
    expect((adminRes.json() as { visibility: string }).visibility).toBe("PUBLIC");

    const anonRes = await app.inject({ method: "PATCH", url, headers: slug, payload: { title: "x" } });
    expect(anonRes.statusCode).toBe(401);
  });

  it("SINGLE: USER (mesmo dono) 403; admin 200; anon 401", async () => {
    await seedSingleApp();
    const owner = await seedUser({ email: "owner@x.com", role: "USER" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(owner.id);

    const url = `/api/v1/universes/${universe.id}`;
    const slug = { "x-app-slug": SINGLE_SLUG };

    const ownerRes = await app.inject({
      method: "PATCH",
      url,
      headers: { ...bearerHeader(owner.id), ...slug },
      payload: { title: "Não pode" },
    });
    expect(ownerRes.statusCode).toBe(403);

    const adminRes = await app.inject({
      method: "PATCH",
      url,
      headers: { ...bearerHeader(admin.id, "ADMIN"), ...slug },
      payload: { title: "Admin pode" },
    });
    expect(adminRes.statusCode).toBe(200);

    const anonRes = await app.inject({ method: "PATCH", url, headers: slug, payload: { title: "x" } });
    expect(anonRes.statusCode).toBe(401);
  });
});

// ── DELETE /api/v1/universes/:id — persona matrix + cascade ───────────────────

describe("DELETE /api/v1/universes/:id — persona matrix e cascade", () => {
  it("MULTI: stranger 403, anon 401, owner 200; SINGLE: USER 403, admin 200", async () => {
    await seedMultiApp();
    await seedSingleApp();
    const owner = await seedUser({ email: "owner@x.com", role: "USER" });
    const stranger = await seedUser({ email: "stranger@x.com", role: "USER" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const uniA = await seedUniverse(owner.id);
    const uniB = await seedUniverse(owner.id);

    const multi = { "x-app-slug": MULTI_SLUG };
    const single = { "x-app-slug": SINGLE_SLUG };

    // MULTI
    expect((await app.inject({ method: "DELETE", url: `/api/v1/universes/${uniA.id}`, headers: { ...bearerHeader(stranger.id), ...multi } })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: `/api/v1/universes/${uniA.id}`, headers: multi })).statusCode).toBe(401);
    expect((await app.inject({ method: "DELETE", url: `/api/v1/universes/${uniA.id}`, headers: { ...bearerHeader(owner.id), ...multi } })).statusCode).toBe(200);

    // SINGLE: dono USER não pode; admin pode
    expect((await app.inject({ method: "DELETE", url: `/api/v1/universes/${uniB.id}`, headers: { ...bearerHeader(owner.id), ...single } })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: `/api/v1/universes/${uniB.id}`, headers: { ...bearerHeader(admin.id, "ADMIN"), ...single } })).statusCode).toBe(200);
  });

  it("soft-delete cascata: universo some e filhos ficam invisíveis", async () => {
    await seedMultiApp();
    const owner = await seedUser({ email: "owner@x.com", role: "USER" });
    const universe = await seedUniverse(owner.id);
    await db.insert(characters).values({ universeId: universe.id, name: "Herói", classification: "PRINCIPAL", traits: [] });
    await db.insert(themes).values({ universeId: universe.id, title: "Amizade" });
    await seedArc(universe.id);

    const headers = { ...bearerHeader(owner.id), "x-app-slug": MULTI_SLUG };

    const delRes = await app.inject({ method: "DELETE", url: `/api/v1/universes/${universe.id}`, headers });
    expect(delRes.statusCode).toBe(200);

    // Universo invisível
    expect((await app.inject({ method: "GET", url: `/api/v1/universes/${universe.id}`, headers })).statusCode).toBe(404);

    // Filhos invisíveis (rotas de lista retornam 404 do universo pai)
    expect((await app.inject({ method: "GET", url: `/api/v1/universes/${universe.id}/characters`, headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/v1/universes/${universe.id}/arcs`, headers })).statusCode).toBe(404);

    // E as linhas ganharam deleted_at (cascata no banco)
    const [char] = await db.select().from(characters);
    const [theme] = await db.select().from(themes);
    const [arc] = await db.select().from(storyArcs);
    expect(char!.deletedAt).not.toBeNull();
    expect(theme!.deletedAt).not.toBeNull();
    expect(arc!.deletedAt).not.toBeNull();
  });
});

// ── GET /api/v1/universes — scope + paginação cursor-lite ─────────────────────

describe("GET /api/v1/universes — scope + paginação", () => {
  it("scope=mine (default) lista só os do usuário; scope=public só PUBLIC", async () => {
    await seedMultiApp();
    const userA = await seedUser({ email: "a@x.com", role: "USER" });
    const userB = await seedUser({ email: "b@x.com", role: "USER" });
    const mine = await seedUniverse(userA.id);
    const otherPrivate = await seedUniverse(userB.id);
    const otherPublic = await seedUniverse(userB.id, { visibility: "PUBLIC" });

    const headers = { ...bearerHeader(userA.id), "x-app-slug": MULTI_SLUG };

    const mineRes = await app.inject({ method: "GET", url: "/api/v1/universes", headers });
    expect(mineRes.statusCode).toBe(200);
    const mineBody = mineRes.json() as { items: Array<{ id: string }>; next_cursor: string | null };
    expect(mineBody.items.map((u) => u.id)).toEqual([mine.id]);
    expect(mineBody.next_cursor).toBeNull();

    const pubRes = await app.inject({ method: "GET", url: "/api/v1/universes?scope=public", headers });
    const pubBody = pubRes.json() as { items: Array<{ id: string }> };
    expect(pubBody.items.map((u) => u.id)).toEqual([otherPublic.id]);
    expect(pubBody.items.some((u) => u.id === otherPrivate.id)).toBe(false);
  });

  it("pagina por cursor (limit=1) sem repetir itens", async () => {
    await seedMultiApp();
    const user = await seedUser({ email: "a@x.com", role: "USER" });
    await seedUniverse(user.id, { title: "U1" });
    await seedUniverse(user.id, { title: "U2" });
    const headers = { ...bearerHeader(user.id), "x-app-slug": MULTI_SLUG };

    const page1 = await app.inject({ method: "GET", url: "/api/v1/universes?limit=1", headers });
    const body1 = page1.json() as { items: Array<{ id: string }>; next_cursor: string | null };
    expect(body1.items).toHaveLength(1);
    expect(body1.next_cursor).toBeTruthy();

    const page2 = await app.inject({
      method: "GET",
      url: `/api/v1/universes?limit=1&cursor=${body1.next_cursor}`,
      headers,
    });
    const body2 = page2.json() as { items: Array<{ id: string }>; next_cursor: string | null };
    expect(body2.items).toHaveLength(1);
    expect(body2.items[0]!.id).not.toBe(body1.items[0]!.id);
  });

  it("rejeita limit > 50 e cursor inválido com 400; anon 401", async () => {
    const user = await seedUser({ email: "a@x.com", role: "USER" });
    const headers = bearerHeader(user.id);

    expect((await app.inject({ method: "GET", url: "/api/v1/universes?limit=51", headers })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/v1/universes?cursor=%%%", headers })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/v1/universes" })).statusCode).toBe(401);
  });
});

// ── Location roundtrip (RF-10) ────────────────────────────────────────────────

describe("universes — location roundtrip", () => {
  it("cria com location, lê de volta, edita e limpa com null", async () => {
    await seedMultiApp();
    const user = await seedUser({ email: "geo@x.com", role: "USER" });
    const headers = { ...bearerHeader(user.id), "x-app-slug": MULTI_SLUG };

    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers,
      payload: {
        title: "Mundo Geo",
        description: "Com localização",
        location_context: "São Paulo, SP",
        latitude: -23.55052,
        longitude: -46.633308,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as {
      id: string;
      locationContext: string;
      latitude: string;
      longitude: string;
    };
    expect(created.locationContext).toBe("São Paulo, SP");
    expect(Number(created.latitude)).toBeCloseTo(-23.55052, 5);
    expect(Number(created.longitude)).toBeCloseTo(-46.633308, 5);

    // GET devolve os mesmos valores
    const getRes = await app.inject({ method: "GET", url: `/api/v1/universes/${created.id}`, headers });
    const fetched = getRes.json() as { locationContext: string; latitude: string };
    expect(fetched.locationContext).toBe("São Paulo, SP");
    expect(Number(fetched.latitude)).toBeCloseTo(-23.55052, 5);

    // PATCH atualiza e depois limpa com null
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${created.id}`,
      headers,
      payload: { location_context: "Rio de Janeiro, RJ", latitude: -22.9068, longitude: -43.1729 },
    });
    expect(patchRes.statusCode).toBe(200);
    expect((patchRes.json() as { locationContext: string }).locationContext).toBe("Rio de Janeiro, RJ");

    const clearRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${created.id}`,
      headers,
      payload: { location_context: null, latitude: null, longitude: null },
    });
    expect(clearRes.statusCode).toBe(200);
    const cleared = clearRes.json() as { locationContext: string | null; latitude: string | null };
    expect(cleared.locationContext).toBeNull();
    expect(cleared.latitude).toBeNull();
  });

  it("rejeita latitude fora do intervalo com 400", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers: bearerHeader(admin.id, "ADMIN"),
      payload: { title: "Geo ruim", description: "Latitude inválida", latitude: 123 },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Arcs: GET list / PATCH guards ─────────────────────────────────────────────

describe("GET /api/v1/universes/:id/arcs — leitura herda regra do universo", () => {
  it("owner lista arcos; stranger 403; admin 200; anon 401", async () => {
    await seedMultiApp();
    const owner = await seedUser({ email: "owner@x.com", role: "USER" });
    const stranger = await seedUser({ email: "stranger@x.com", role: "USER" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(owner.id);
    const arc = await seedArc(universe.id);

    const url = `/api/v1/universes/${universe.id}/arcs`;
    const slug = { "x-app-slug": MULTI_SLUG };

    const ownerRes = await app.inject({ method: "GET", url, headers: { ...bearerHeader(owner.id), ...slug } });
    expect(ownerRes.statusCode).toBe(200);
    const body = ownerRes.json() as Array<{ id: string; title: string; version: number; isActive: boolean }>;
    expect(body).toHaveLength(1);
    expect(body[0]!.id).toBe(arc.id);
    expect(body[0]!.version).toBe(1);
    expect(body[0]!.isActive).toBe(true);

    expect((await app.inject({ method: "GET", url, headers: { ...bearerHeader(stranger.id), ...slug } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url, headers: { ...bearerHeader(admin.id, "ADMIN"), ...slug } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url, headers: slug })).statusCode).toBe(401);
  });

  it("não lista arcos soft-deletados", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(admin.id);
    const arc = await seedArc(universe.id);
    await db.update(storyArcs).set({ deletedAt: new Date() }).where(eq(storyArcs.id, arc.id));

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/arcs`,
      headers: bearerHeader(admin.id, "ADMIN"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json() as unknown[]).toHaveLength(0);
  });
});

describe("PATCH /api/v1/universes/:id/arcs/:aid — guards e campos editáveis", () => {
  it("MULTI: owner edita title/isActive; summary/version NÃO mudam", async () => {
    await seedMultiApp();
    const owner = await seedUser({ email: "owner@x.com", role: "USER" });
    const universe = await seedUniverse(owner.id);
    const arc = await seedArc(universe.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${universe.id}/arcs/${arc.id}`,
      headers: { ...bearerHeader(owner.id), "x-app-slug": MULTI_SLUG },
      payload: { title: "Arco renomeado", isActive: false, summary: "hack", version: 99 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { title: string; isActive: boolean; summary: string; version: number };
    expect(body.title).toBe("Arco renomeado");
    expect(body.isActive).toBe(false);
    // summary/version pertencem ao pipeline de geração — intocados
    expect(body.summary).toBe("Resumo inicial");
    expect(body.version).toBe(1);
  });

  it("MULTI: stranger 403; SINGLE: USER dono 403; admin 200; anon 401", async () => {
    await seedMultiApp();
    await seedSingleApp();
    const owner = await seedUser({ email: "owner@x.com", role: "USER" });
    const stranger = await seedUser({ email: "stranger@x.com", role: "USER" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(owner.id);
    const arc = await seedArc(universe.id);

    const url = `/api/v1/universes/${universe.id}/arcs/${arc.id}`;
    const payload = { title: "x" };

    expect((await app.inject({ method: "PATCH", url, headers: { ...bearerHeader(stranger.id), "x-app-slug": MULTI_SLUG }, payload })).statusCode).toBe(403);
    expect((await app.inject({ method: "PATCH", url, headers: { ...bearerHeader(owner.id), "x-app-slug": SINGLE_SLUG }, payload })).statusCode).toBe(403);
    expect((await app.inject({ method: "PATCH", url, headers: { ...bearerHeader(admin.id, "ADMIN"), "x-app-slug": SINGLE_SLUG }, payload })).statusCode).toBe(200);
    expect((await app.inject({ method: "PATCH", url, payload })).statusCode).toBe(401);
  });

  it("404 para arco inexistente ou de outro universo", async () => {
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const uniA = await seedUniverse(admin.id);
    const uniB = await seedUniverse(admin.id);
    const arcB = await seedArc(uniB.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${uniA.id}/arcs/${arcB.id}`,
      headers: bearerHeader(admin.id, "ADMIN"),
      payload: { title: "x" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Blocklist (SDD 8.2): create + edit de universo/personagem/tema ────────────

describe("blocklist — 422 CONTENT_REJECTED em create/edit", () => {
  const expectRejected = (res: { statusCode: number; json: () => unknown }) => {
    expect(res.statusCode).toBe(422);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("CONTENT_REJECTED");
    expect(body.error.message).toBe("Conteúdo inadequado para o público infantil.");
  };

  it("rejeita universo com termo bloqueado no create e no patch", async () => {
    await seedMultiApp();
    const user = await seedUser({ email: "u@x.com", role: "USER" });
    const headers = { ...bearerHeader(user.id), "x-app-slug": MULTI_SLUG };

    // "sangue" está na blocklist (ai/sanitize.ts)
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers,
      payload: { title: "Mundo sombrio", description: "Uma terra coberta de sangue" },
    });
    expectRejected(createRes);

    const universe = await seedUniverse(user.id);
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${universe.id}`,
      headers,
      payload: { title: "Reino da violência" },
    });
    expectRejected(patchRes);
  });

  it("rejeita personagem com termo bloqueado no create (traits) e no patch (name)", async () => {
    await seedMultiApp();
    const user = await seedUser({ email: "u@x.com", role: "USER" });
    const universe = await seedUniverse(user.id);
    const headers = { ...bearerHeader(user.id), "x-app-slug": MULTI_SLUG };

    const createRes = await app.inject({
      method: "POST",
      url: `/api/v1/universes/${universe.id}/characters`,
      headers,
      payload: { name: "Vilão", classification: "ANTAGONISTA", traits: ["gosta de tortura"] },
    });
    expectRejected(createRes);

    const [char] = await db
      .insert(characters)
      .values({ universeId: universe.id, name: "Bonzinho", classification: "PRINCIPAL", traits: [] })
      .returning();
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${universe.id}/characters/${char!.id}`,
      headers,
      payload: { name: "Demônio das trevas" },
    });
    expectRejected(patchRes);
  });

  it("rejeita tema com termo bloqueado no create e no patch", async () => {
    await seedMultiApp();
    const user = await seedUser({ email: "u@x.com", role: "USER" });
    const universe = await seedUniverse(user.id);
    const headers = { ...bearerHeader(user.id), "x-app-slug": MULTI_SLUG };

    const createRes = await app.inject({
      method: "POST",
      url: `/api/v1/universes/${universe.id}/themes`,
      headers,
      payload: { title: "Terror extremo na floresta" },
    });
    expectRejected(createRes);

    const [theme] = await db
      .insert(themes)
      .values({ universeId: universe.id, title: "Amizade" })
      .returning();
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/universes/${universe.id}/themes/${theme!.id}`,
      headers,
      payload: { description: "Sobre drogas e coisas ruins" },
    });
    expectRejected(patchRes);
  });

  it("aceita conteúdo limpo normalmente (não bloqueia falso positivo)", async () => {
    await seedMultiApp();
    const user = await seedUser({ email: "u@x.com", role: "USER" });
    const headers = { ...bearerHeader(user.id), "x-app-slug": MULTI_SLUG };

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/universes",
      headers,
      payload: { title: "Jardim Encantado", description: "Flores que cantam ao amanhecer" },
    });
    expect(res.statusCode).toBe(201);
  });
});
