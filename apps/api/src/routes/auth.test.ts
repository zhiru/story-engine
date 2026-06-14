import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { getUserByEmail } from "../repos/users.js";
import { verifyPassword } from "../auth/hash.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb();
});

const testUser = {
  name: "Test User",
  email: "test@example.com",
  password: "securePassword123",
};

async function registerUser() {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: testUser,
  });
  return res;
}

describe("POST /api/v1/auth/register", () => {
  it("returns 201 and tokens on success", async () => {
    const res = await registerUser();
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty("access_token");
    expect(body).toHaveProperty("refresh_token");
  });

  it("password is NOT stored in plaintext (hash check)", async () => {
    await registerUser();
    const user = await getUserByEmail(testUser.email);
    expect(user).not.toBeNull();
    // password_hash must differ from raw password
    expect(user!.passwordHash).not.toBe(testUser.password);
    // but verifyPassword must return true
    const valid = await verifyPassword(user!.passwordHash, testUser.password);
    expect(valid).toBe(true);
  });

  it("returns 409 on duplicate email", async () => {
    await registerUser();
    const res2 = await registerUser();
    expect(res2.statusCode).toBe(409);
  });
});

describe("POST /api/v1/auth/login", () => {
  beforeEach(async () => {
    await registerUser();
  });

  it("returns 200 and tokens with correct credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: testUser.email, password: testUser.password },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("access_token");
    expect(body).toHaveProperty("refresh_token");
  });

  it("returns 401 with wrong password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: testUser.email, password: "wrongpassword" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 with unknown email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "nobody@example.com", password: "whatever" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/v1/auth/refresh — token rotation", () => {
  it("rotates: new pair works; old refresh → 401", async () => {
    const registerRes = await registerUser();
    const { refresh_token: originalRefresh } = registerRes.json();

    // Rotate: get new tokens
    const refreshRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refresh_token: originalRefresh },
    });
    expect(refreshRes.statusCode).toBe(200);
    const { access_token: newAccess, refresh_token: newRefresh } =
      refreshRes.json();
    expect(newAccess).toBeTruthy();
    expect(newRefresh).toBeTruthy();
    expect(newRefresh).not.toBe(originalRefresh);

    // Old refresh token must now be rejected (revoked)
    const reuseRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refresh_token: originalRefresh },
    });
    expect(reuseRes.statusCode).toBe(401);

    // New refresh token works
    const newRefreshRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refresh_token: newRefresh },
    });
    expect(newRefreshRes.statusCode).toBe(200);
  });
});

describe("Protected routes — auth guard", () => {
  it("returns 401 without Authorization header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/child-profiles",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/child-profiles",
      headers: { authorization: "Bearer invalid.token.here" },
    });
    expect(res.statusCode).toBe(401);
  });
});
