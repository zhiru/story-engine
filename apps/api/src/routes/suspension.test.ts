/**
 * Testes de enforcement de suspensão/exclusão em toda requisição autenticada:
 * - login de conta suspensa → 403 SUSPENDED
 * - rota autenticada com conta suspensa → 403 SUSPENDED
 * - refresh de conta suspensa → 403 SUSPENDED
 * - token de usuário excluído (soft delete) → 401 UNAUTHORIZED
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { buildApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb();
});

const testUser = {
  name: "Suspended User",
  email: "suspended@example.com",
  password: "securePassword123",
};

async function registerUser() {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: testUser,
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { access_token: string; refresh_token: string };
}

function futureDate(days = 7): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function suspendByEmail(email: string, until: Date | null) {
  await db
    .update(users)
    .set({ suspendedUntil: until })
    .where(eq(users.email, email));
}

describe("Suspension enforcement", () => {
  it("login of suspended account returns 403 SUSPENDED", async () => {
    await registerUser();
    await suspendByEmail(testUser.email, futureDate());

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: testUser.email, password: testUser.password },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as {
      error: { code: string; message: string; request_id: string };
    };
    expect(body.error.code).toBe("SUSPENDED");
    expect(body.error.message).toMatch(/^Conta suspensa até /);
    expect(body.error.request_id).toBeTruthy();
  });

  it("authenticated route with suspended account returns 403 SUSPENDED", async () => {
    const { access_token } = await registerUser();
    await suspendByEmail(testUser.email, futureDate());

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${access_token}` },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe("SUSPENDED");
  });

  it("refresh with suspended account returns 403 SUSPENDED", async () => {
    const { refresh_token } = await registerUser();
    await suspendByEmail(testUser.email, futureDate());

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refresh_token },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe("SUSPENDED");
  });

  it("suspension in the past does not block", async () => {
    const { access_token } = await registerUser();
    const past = new Date();
    past.setDate(past.getDate() - 1);
    await suspendByEmail(testUser.email, past);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${access_token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it("valid token of soft-deleted user returns 401 UNAUTHORIZED", async () => {
    const { access_token } = await registerUser();
    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.email, testUser.email));

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${access_token}` },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as {
      error: { code: string; request_id: string };
    };
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.request_id).toBeTruthy();
  });
});
