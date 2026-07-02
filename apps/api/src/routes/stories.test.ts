import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { buildApp } from "../app.js";
import { resetDb, seedUser } from "../test/db.js";
import { signAccess } from "../auth/jwt.js";
import { db } from "../db/client.js";
import { universes, stories, storyArcs, appSettings } from "../db/schema.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb();
});

// ── helpers ─────────────────────────────────────────────────────────────────

async function seedUniverse(
  userId: string,
  visibility: "PUBLIC" | "PRIVATE" | "PAID" = "PUBLIC",
) {
  const [row] = await db
    .insert(universes)
    .values({
      userId,
      title: "Test Universe",
      description: "A test universe",
      visibility,
    })
    .returning();
  return row!;
}

async function seedStory(
  universeId: string,
  userId: string,
  moderationStatus: "PENDING" | "APPROVED" | "REJECTED" = "APPROVED",
  opts: {
    visibility?: "PUBLIC" | "PRIVATE" | "PAID";
    storyArcId?: string;
    createdAt?: Date;
    title?: string;
  } = {},
) {
  const [row] = await db
    .insert(stories)
    .values({
      universeId,
      userId,
      title: opts.title ?? `Story (${moderationStatus})`,
      content: "Once upon a time…",
      promptUsed: "test",
      moderationStatus,
      ...(opts.visibility && { visibility: opts.visibility }),
      ...(opts.storyArcId && { storyArcId: opts.storyArcId }),
      ...(opts.createdAt && { createdAt: opts.createdAt }),
    })
    .returning();
  return row!;
}

async function seedArc(universeId: string, title = "Arc 1") {
  const [row] = await db
    .insert(storyArcs)
    .values({ universeId, title })
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
      headers: {
        ...bearerHeader(admin.id, "ADMIN"),
        "x-app-slug": "test-app",
      },
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

  it("returns 404 for non-existent universe", async () => {
    const user = await seedUser({ email: "user@x.com" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/universes/00000000-0000-0000-0000-000000000001/stories",
      headers: bearerHeader(user.id),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  // ── Autorização por universo (SDD §6.4) ────────────────────────────────────

  it("denies a stranger listing stories of a PRIVATE universe (403)", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const stranger = await seedUser({ email: "stranger@x.com" });
    const universe = await seedUniverse(owner.id, "PRIVATE");
    await seedStory(universe.id, owner.id, "APPROVED");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/stories`,
      headers: bearerHeader(stranger.id),
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as {
      error: { code: string; request_id: string };
    };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.request_id).toBeTruthy();
  });

  it("owner can list stories of their PRIVATE universe", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const universe = await seedUniverse(owner.id, "PRIVATE");
    await seedStory(universe.id, owner.id, "APPROVED");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/stories`,
      headers: bearerHeader(owner.id),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it("ADMIN can list stories of another user's PRIVATE universe", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(owner.id, "PRIVATE");
    await seedStory(universe.id, owner.id, "APPROVED");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/stories`,
      headers: bearerHeader(admin.id, "ADMIN"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it("any authenticated user can list stories of a PUBLIC universe", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const stranger = await seedUser({ email: "stranger@x.com" });
    const universe = await seedUniverse(owner.id, "PUBLIC");
    await seedStory(universe.id, owner.id, "APPROVED");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/stories`,
      headers: bearerHeader(stranger.id),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it("stranger can list stories of the app's single-mode PRIVATE universe", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const stranger = await seedUser({ email: "stranger@x.com" });
    const universe = await seedUniverse(owner.id, "PRIVATE");
    await seedSettings(universe.id); // app "test-app" com singleModeUniverseId
    await seedStory(universe.id, owner.id, "APPROVED");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/universes/${universe.id}/stories`,
      headers: { ...bearerHeader(stranger.id), "x-app-slug": "test-app" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
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

// ── GET /api/v1/stories (listagem top-level, WP-B) ───────────────────────────

type StoriesListBody = {
  items: {
    id: string;
    universe_id: string;
    story_arc_id: string | null;
    title: string;
    visibility: string;
    moderation_status: string;
    created_at: string;
  }[];
  next_cursor: string | null;
};

describe("GET /api/v1/stories", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/stories" });
    expect(res.statusCode).toBe(401);
  });

  /**
   * Matriz de personas (SDD §12): dono do universo / gerador / estranho /
   * admin sobre o mesmo conjunto de histórias.
   */
  describe("persona matrix", () => {
    async function seedMatrix() {
      const owner = await seedUser({ email: "owner@x.com" });
      const generator = await seedUser({ email: "generator@x.com" });
      const stranger = await seedUser({ email: "stranger@x.com" });
      const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
      const universe = await seedUniverse(owner.id, "PUBLIC");

      // gerada por terceiro no universo do dono — privada e pendente
      const sPrivatePending = await seedStory(universe.id, generator.id, "PENDING", {
        visibility: "PRIVATE",
        title: "private-pending-by-generator",
      });
      // gerada pelo dono — privada
      const sOwnerPrivate = await seedStory(universe.id, owner.id, "APPROVED", {
        visibility: "PRIVATE",
        title: "private-approved-by-owner",
      });
      // pública e aprovada — visível a todos
      const sPublicApproved = await seedStory(universe.id, generator.id, "APPROVED", {
        visibility: "PUBLIC",
        title: "public-approved",
      });
      // pública mas PENDENTE — não visível a estranhos
      const sPublicPending = await seedStory(universe.id, generator.id, "PENDING", {
        visibility: "PUBLIC",
        title: "public-pending",
      });

      return {
        owner,
        generator,
        stranger,
        admin,
        universe,
        sPrivatePending,
        sOwnerPrivate,
        sPublicApproved,
        sPublicPending,
      };
    }

    async function listIds(userId: string, role: "USER" | "ADMIN" = "USER") {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/stories",
        headers: bearerHeader(userId, role),
      });
      expect(res.statusCode).toBe(200);
      return (res.json() as StoriesListBody).items.map((i) => i.id).sort();
    }

    it("universe owner sees every story in their universe", async () => {
      const m = await seedMatrix();
      expect(await listIds(m.owner.id)).toEqual(
        [
          m.sPrivatePending.id,
          m.sOwnerPrivate.id,
          m.sPublicApproved.id,
          m.sPublicPending.id,
        ].sort(),
      );
    });

    it("generator sees own stories plus PUBLIC+APPROVED", async () => {
      const m = await seedMatrix();
      expect(await listIds(m.generator.id)).toEqual(
        [
          m.sPrivatePending.id,
          m.sPublicApproved.id,
          m.sPublicPending.id,
        ].sort(),
      );
    });

    it("stranger sees only PUBLIC+APPROVED", async () => {
      const m = await seedMatrix();
      expect(await listIds(m.stranger.id)).toEqual([m.sPublicApproved.id]);
    });

    it("ADMIN sees everything", async () => {
      const m = await seedMatrix();
      expect(await listIds(m.admin.id, "ADMIN")).toEqual(
        [
          m.sPrivatePending.id,
          m.sOwnerPrivate.id,
          m.sPublicApproved.id,
          m.sPublicPending.id,
        ].sort(),
      );
    });
  });

  it("filters by story_arc_id (SDD §7.1 filtros: universe, arc)", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const universe = await seedUniverse(owner.id);
    const arc = await seedArc(universe.id);
    const inArc = await seedStory(universe.id, owner.id, "APPROVED", {
      storyArcId: arc.id,
    });
    await seedStory(universe.id, owner.id, "APPROVED"); // fora do arco

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/stories?story_arc_id=${arc.id}`,
      headers: bearerHeader(owner.id),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as StoriesListBody;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.id).toBe(inArc.id);
    expect(body.items[0]!.story_arc_id).toBe(arc.id);
  });

  it("filters by universe_id", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const u1 = await seedUniverse(owner.id);
    const u2 = await seedUniverse(owner.id);
    const inU1 = await seedStory(u1.id, owner.id, "APPROVED");
    await seedStory(u2.id, owner.id, "APPROVED");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/stories?universe_id=${u1.id}`,
      headers: bearerHeader(owner.id),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as StoriesListBody;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.id).toBe(inU1.id);
  });

  it("universe_id of a PRIVATE universe → 403 for stranger", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const stranger = await seedUser({ email: "stranger@x.com" });
    const universe = await seedUniverse(owner.id, "PRIVATE");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/stories?universe_id=${universe.id}`,
      headers: bearerHeader(stranger.id),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("unknown universe_id → 404; malformed → 400", async () => {
    const user = await seedUser({ email: "user@x.com" });

    const missing = await app.inject({
      method: "GET",
      url: "/api/v1/stories?universe_id=00000000-0000-0000-0000-000000000001",
      headers: bearerHeader(user.id),
    });
    expect(missing.statusCode).toBe(404);

    const malformed = await app.inject({
      method: "GET",
      url: "/api/v1/stories?universe_id=not-a-uuid",
      headers: bearerHeader(user.id),
    });
    expect(malformed.statusCode).toBe(400);
  });

  it("does not list soft-deleted stories", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const universe = await seedUniverse(owner.id);
    const story = await seedStory(universe.id, owner.id, "APPROVED");
    await db
      .update(stories)
      .set({ deletedAt: new Date() })
      .where(eq(stories.id, story.id));

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/stories",
      headers: bearerHeader(owner.id),
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as StoriesListBody).items).toHaveLength(0);
  });

  it("paginates newest-first with limit=1 and terminates", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const universe = await seedUniverse(owner.id);
    const seeded = [
      await seedStory(universe.id, owner.id, "APPROVED", {
        createdAt: new Date("2026-01-01T00:00:00Z"),
      }),
      await seedStory(universe.id, owner.id, "APPROVED", {
        createdAt: new Date("2026-02-01T00:00:00Z"),
      }),
      await seedStory(universe.id, owner.id, "APPROVED", {
        createdAt: new Date("2026-03-01T00:00:00Z"),
      }),
    ];

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const url: string = `/api/v1/stories?limit=1${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await app.inject({
        method: "GET",
        url,
        headers: bearerHeader(owner.id),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as StoriesListBody;
      seen.push(...body.items.map((i) => i.id));
      cursor = body.next_cursor;
      if (!cursor) break;
    }

    expect(cursor).toBeNull();
    expect(new Set(seen).size).toBe(3);
    expect(seen).toEqual(seeded.map((s) => s.id).reverse()); // mais recentes primeiro
  });
});

// ── PATCH /api/v1/stories/:id (visibilidade, WP-B) ───────────────────────────

describe("PATCH /api/v1/stories/:id", () => {
  function patchVisibility(
    storyId: string,
    userId: string,
    visibility: unknown,
    role: "USER" | "ADMIN" = "USER",
  ) {
    return app.inject({
      method: "PATCH",
      url: `/api/v1/stories/${storyId}`,
      headers: bearerHeader(userId, role),
      payload: { visibility },
    });
  }

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/stories/00000000-0000-0000-0000-000000000001",
      payload: { visibility: "PUBLIC" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for unknown story", async () => {
    const user = await seedUser({ email: "user@x.com" });
    const res = await patchVisibility(
      "00000000-0000-0000-0000-000000000001",
      user.id,
      "PRIVATE",
    );
    expect(res.statusCode).toBe(404);
  });

  it("generator can change visibility (APPROVED → PUBLIC)", async () => {
    const generator = await seedUser({ email: "generator@x.com" });
    const universe = await seedUniverse(generator.id);
    const story = await seedStory(universe.id, generator.id, "APPROVED", {
      visibility: "PRIVATE",
    });

    const res = await patchVisibility(story.id, generator.id, "PUBLIC");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: story.id,
      visibility: "PUBLIC",
      moderation_status: "APPROVED",
    });

    const [row] = await db
      .select()
      .from(stories)
      .where(eq(stories.id, story.id));
    expect(row!.visibility).toBe("PUBLIC");
  });

  it("PUBLIC requires APPROVED → 422 CONTENT_NOT_APPROVED for PENDING story", async () => {
    const generator = await seedUser({ email: "generator@x.com" });
    const universe = await seedUniverse(generator.id);
    const story = await seedStory(universe.id, generator.id, "PENDING");

    const res = await patchVisibility(story.id, generator.id, "PUBLIC");

    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("CONTENT_NOT_APPROVED");
  });

  it("non-PUBLIC visibility does not require approval (PENDING → PAID ok)", async () => {
    const generator = await seedUser({ email: "generator@x.com" });
    const universe = await seedUniverse(generator.id);
    const story = await seedStory(universe.id, generator.id, "PENDING");

    const res = await patchVisibility(story.id, generator.id, "PAID");

    expect(res.statusCode).toBe(200);
    expect(res.json().visibility).toBe("PAID");
  });

  it("stranger cannot change visibility (403)", async () => {
    const generator = await seedUser({ email: "generator@x.com" });
    const stranger = await seedUser({ email: "stranger@x.com" });
    const universe = await seedUniverse(generator.id);
    const story = await seedStory(universe.id, generator.id, "APPROVED");

    const res = await patchVisibility(story.id, stranger.id, "PRIVATE");
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("universe owner who is not the generator cannot change visibility (403)", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const generator = await seedUser({ email: "generator@x.com" });
    const universe = await seedUniverse(owner.id);
    const story = await seedStory(universe.id, generator.id, "APPROVED");

    const res = await patchVisibility(story.id, owner.id, "PRIVATE");
    expect(res.statusCode).toBe(403);
  });

  it("ADMIN who is not the generator cannot change visibility (403 — SDD §6.4: gerador)", async () => {
    const generator = await seedUser({ email: "generator@x.com" });
    const admin = await seedUser({ email: "admin@x.com", role: "ADMIN" });
    const universe = await seedUniverse(generator.id);
    const story = await seedStory(universe.id, generator.id, "APPROVED");

    const res = await patchVisibility(story.id, admin.id, "PRIVATE", "ADMIN");
    expect(res.statusCode).toBe(403);
  });

  it("rejects invalid visibility value with 400", async () => {
    const generator = await seedUser({ email: "generator@x.com" });
    const universe = await seedUniverse(generator.id);
    const story = await seedStory(universe.id, generator.id, "APPROVED");

    const res = await patchVisibility(story.id, generator.id, "EVERYONE");
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for soft-deleted story", async () => {
    const generator = await seedUser({ email: "generator@x.com" });
    const universe = await seedUniverse(generator.id);
    const story = await seedStory(universe.id, generator.id, "APPROVED");
    await db
      .update(stories)
      .set({ deletedAt: new Date() })
      .where(eq(stories.id, story.id));

    const res = await patchVisibility(story.id, generator.id, "PRIVATE");
    expect(res.statusCode).toBe(404);
  });
});
