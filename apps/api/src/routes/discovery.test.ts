import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { resetDb, seedUser } from "../test/db.js";
import { signAccess } from "../auth/jwt.js";
import { db } from "../db/client.js";
import { universes } from "../db/schema.js";

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
  opts: {
    title?: string;
    visibility?: "PUBLIC" | "PRIVATE" | "PAID";
    ratingScore?: string;
    createdAt?: Date;
    deletedAt?: Date | null;
  } = {},
) {
  const [row] = await db
    .insert(universes)
    .values({
      userId,
      title: opts.title ?? "Universe",
      description: "A universe",
      visibility: opts.visibility ?? "PUBLIC",
      ratingScore: opts.ratingScore ?? "0.00",
      ...(opts.createdAt && { createdAt: opts.createdAt }),
      ...(opts.deletedAt && { deletedAt: opts.deletedAt }),
    })
    .returning();
  return row!;
}

function bearerHeader(userId: string, role: "USER" | "ADMIN" = "USER") {
  return { authorization: `Bearer ${signAccess({ sub: userId, role })}` };
}

type DiscoveryItem = {
  id: string;
  title: string;
  description: string;
  rating_score: number;
  created_at: string;
  owner_name: string;
};
type DiscoveryBody = { items: DiscoveryItem[]; next_cursor: string | null };

// ── GET /api/v1/discovery ────────────────────────────────────────────────────

describe("GET /api/v1/discovery", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/discovery" });
    expect(res.statusCode).toBe(401);
  });

  it("shows only PUBLIC universes (not PRIVATE/PAID/deleted)", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const reader = await seedUser({ email: "reader@x.com" });
    const pub = await seedUniverse(owner.id, { title: "Public" });
    await seedUniverse(owner.id, { title: "Private", visibility: "PRIVATE" });
    await seedUniverse(owner.id, { title: "Paid", visibility: "PAID" });
    await seedUniverse(owner.id, { title: "Deleted", deletedAt: new Date() });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/discovery",
      headers: bearerHeader(reader.id),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as DiscoveryBody;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.id).toBe(pub.id);
    expect(body.items[0]!.owner_name).toBe(owner.name);
    expect(body.items[0]!.rating_score).toBe(0);
    expect(body.next_cursor).toBeNull();
  });

  it("default sort is recent (newest first)", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const old = await seedUniverse(owner.id, {
      title: "Old",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const newer = await seedUniverse(owner.id, {
      title: "Newer",
      createdAt: new Date("2026-02-01T00:00:00Z"),
    });
    const newest = await seedUniverse(owner.id, {
      title: "Newest",
      createdAt: new Date("2026-03-01T00:00:00Z"),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/discovery",
      headers: bearerHeader(owner.id),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as DiscoveryBody;
    expect(body.items.map((i) => i.id)).toEqual([newest.id, newer.id, old.id]);
  });

  it("sort=top orders by rating_score desc", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const low = await seedUniverse(owner.id, { ratingScore: "1.50" });
    const high = await seedUniverse(owner.id, { ratingScore: "4.75" });
    const mid = await seedUniverse(owner.id, { ratingScore: "3.00" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/discovery?sort=top",
      headers: bearerHeader(owner.id),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as DiscoveryBody;
    expect(body.items.map((i) => i.id)).toEqual([high.id, mid.id, low.id]);
    expect(body.items[0]!.rating_score).toBe(4.75);
  });

  it("rejects unknown sort with 400", async () => {
    const user = await seedUser({ email: "user@x.com" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/discovery?sort=weird",
      headers: bearerHeader(user.id),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects malformed cursor with 400", async () => {
    const user = await seedUser({ email: "user@x.com" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/discovery?cursor=not-base64-json",
      headers: bearerHeader(user.id),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects limit out of range (0 and 51) with 400", async () => {
    const user = await seedUser({ email: "user@x.com" });
    for (const limit of ["0", "51"]) {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/discovery?limit=${limit}`,
        headers: bearerHeader(user.id),
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it("pagination (recent) walks fully with limit=1 and terminates", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    const seeded = [
      await seedUniverse(owner.id, {
        createdAt: new Date("2026-01-01T00:00:00Z"),
      }),
      await seedUniverse(owner.id, {
        createdAt: new Date("2026-02-01T00:00:00Z"),
      }),
      await seedUniverse(owner.id, {
        createdAt: new Date("2026-03-01T00:00:00Z"),
      }),
    ];

    const seen: string[] = [];
    let cursor: string | null = null;
    // limite defensivo bem acima do necessário — o loop deve terminar antes
    for (let page = 0; page < 10; page++) {
      const url: string = `/api/v1/discovery?limit=1${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await app.inject({
        method: "GET",
        url,
        headers: bearerHeader(owner.id),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as DiscoveryBody;
      expect(body.items.length).toBeLessThanOrEqual(1);
      seen.push(...body.items.map((i) => i.id));
      cursor = body.next_cursor;
      if (!cursor) break;
    }

    expect(cursor).toBeNull(); // terminou
    expect(seen).toHaveLength(3); // sem itens perdidos/duplicados
    expect(new Set(seen).size).toBe(3);
    expect(seen).toEqual(seeded.map((u) => u.id).reverse());
  });

  it("pagination (top) walks fully with limit=1 incl. tie-break on equal scores", async () => {
    const owner = await seedUser({ email: "owner@x.com" });
    // dois empatados em 3.00 → desempate por id; um acima
    await seedUniverse(owner.id, { ratingScore: "3.00" });
    await seedUniverse(owner.id, { ratingScore: "3.00" });
    await seedUniverse(owner.id, { ratingScore: "4.00" });

    const seen: string[] = [];
    const scores: number[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const url: string = `/api/v1/discovery?sort=top&limit=1${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await app.inject({
        method: "GET",
        url,
        headers: bearerHeader(owner.id),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as DiscoveryBody;
      seen.push(...body.items.map((i) => i.id));
      scores.push(...body.items.map((i) => i.rating_score));
      cursor = body.next_cursor;
      if (!cursor) break;
    }

    expect(cursor).toBeNull();
    expect(new Set(seen).size).toBe(3);
    expect(scores).toEqual([4, 3, 3]);
  });
});
