import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { buildApp } from "../app.js";
import { resetDb, seedUser } from "../test/db.js";
import { signAccess } from "../auth/jwt.js";
import { db } from "../db/client.js";
import { ratings, universes } from "../db/schema.js";

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
      title: "Rated Universe",
      description: "A universe",
      visibility,
    })
    .returning();
  return row!;
}

function bearerHeader(userId: string) {
  return { authorization: `Bearer ${signAccess({ sub: userId, role: "USER" })}` };
}

function rate(universeId: string, userId: string, score: unknown) {
  return app.inject({
    method: "PUT",
    url: `/api/v1/universes/${universeId}/rating`,
    headers: bearerHeader(userId),
    payload: { score },
  });
}

// ── PUT /api/v1/universes/:id/rating ────────────────────────────────────────

describe("PUT /api/v1/universes/:id/rating", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/universes/00000000-0000-0000-0000-000000000001/rating",
      payload: { score: 5 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rates a PUBLIC universe and materializes rating_score", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const rater = await seedUser({ email: "rater@x.com" });
    const universe = await seedUniverse(owner.id);

    const res = await rate(universe.id, rater.id, 4);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ rating_score: 4 });

    const [row] = await db
      .select()
      .from(universes)
      .where(eq(universes.id, universe.id));
    expect(row!.ratingScore).toBe("4.00");
  });

  it("upserts: rating twice keeps a single row and updates the aggregate", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const rater = await seedUser({ email: "rater@x.com" });
    const universe = await seedUniverse(owner.id);

    const first = await rate(universe.id, rater.id, 5);
    expect(first.statusCode).toBe(200);
    expect(first.json().rating_score).toBe(5);

    const second = await rate(universe.id, rater.id, 3);
    expect(second.statusCode).toBe(200);
    expect(second.json().rating_score).toBe(3);

    const rows = await db
      .select()
      .from(ratings)
      .where(eq(ratings.universeId, universe.id));
    expect(rows).toHaveLength(1); // UNIQUE(universe_id, user_id)
    expect(rows[0]!.score).toBe(3);

    const [row] = await db
      .select()
      .from(universes)
      .where(eq(universes.id, universe.id));
    expect(row!.ratingScore).toBe("3.00");
  });

  it("aggregates across users with round(avg, 2)", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const a = await seedUser({ email: "a@x.com" });
    const b = await seedUser({ email: "b@x.com" });
    const universe = await seedUniverse(owner.id);

    await rate(universe.id, a.id, 4);
    const res = await rate(universe.id, b.id, 5);

    expect(res.statusCode).toBe(200);
    expect(res.json().rating_score).toBe(4.5);

    const [row] = await db
      .select()
      .from(universes)
      .where(eq(universes.id, universe.id));
    expect(row!.ratingScore).toBe("4.50");
  });

  it("owner cannot rate their own universe (403)", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const universe = await seedUniverse(owner.id);

    const res = await rate(universe.id, owner.id, 5);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("non-PUBLIC universes cannot be rated (403)", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const rater = await seedUser({ email: "rater@x.com" });
    for (const visibility of ["PRIVATE", "PAID"] as const) {
      const universe = await seedUniverse(owner.id, visibility);
      const res = await rate(universe.id, rater.id, 5);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("FORBIDDEN");
    }
  });

  it("returns 404 for unknown universe", async () => {
    const rater = await seedUser({ email: "rater@x.com" });
    const res = await rate(
      "00000000-0000-0000-0000-000000000001",
      rater.id,
      5,
    );
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for soft-deleted universe", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const rater = await seedUser({ email: "rater@x.com" });
    const universe = await seedUniverse(owner.id);
    await db
      .update(universes)
      .set({ deletedAt: new Date() })
      .where(eq(universes.id, universe.id));

    const res = await rate(universe.id, rater.id, 5);
    expect(res.statusCode).toBe(404);
  });

  it("rejects out-of-range and non-integer scores with 400", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const rater = await seedUser({ email: "rater@x.com" });
    const universe = await seedUniverse(owner.id);

    for (const score of [0, 6, 4.5, "5", null]) {
      const res = await rate(universe.id, rater.id, score);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });
});
