import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { CURRENT_POLICY_VERSION } from "../auth/middleware.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb();
});

async function registerAndGetTokens(
  email: string,
  password = "password123",
  name = "Test User",
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name, email, password },
  });
  const body = res.json() as { access_token: string; refresh_token: string };
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

async function grantConsent(accessToken: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/consent",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      consent_type: "PARENTAL_DATA",
      policy_version: CURRENT_POLICY_VERSION,
      granted: true,
    },
  });
}

describe("GET /api/v1/child-profiles — scope isolation", () => {
  it("user does NOT see child profiles belonging to another guardian", async () => {
    const { accessToken: tokenA } = await registerAndGetTokens("a@example.com");
    const { accessToken: tokenB } = await registerAndGetTokens("b@example.com");

    // Grant consent for A
    await grantConsent(tokenA);

    // Create a profile as user A
    await app.inject({
      method: "POST",
      url: "/api/v1/child-profiles",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { nickname: "Alice's Kid", age_band: "4_6" },
    });

    // Grant consent for B
    await grantConsent(tokenB);

    // B should not see A's profiles
    const resB = await app.inject({
      method: "GET",
      url: "/api/v1/child-profiles",
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(resB.statusCode).toBe(200);
    const profiles = resB.json() as unknown[];
    expect(profiles).toHaveLength(0);
  });
});

describe("POST /api/v1/child-profiles — consent gate", () => {
  it("returns 403 without PARENTAL_DATA consent", async () => {
    const { accessToken } = await registerAndGetTokens("c@example.com");

    // No consent granted — should be 403
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/child-profiles",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { nickname: "Test Kid", age_band: "7_9" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 201 after granting PARENTAL_DATA consent", async () => {
    const { accessToken } = await registerAndGetTokens("d@example.com");

    // Grant consent
    const consentRes = await grantConsent(accessToken);
    expect(consentRes.statusCode).toBe(201);

    // Now create profile
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/child-profiles",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { nickname: "Test Kid", age_band: "7_9" },
    });
    expect(res.statusCode).toBe(201);
    const profile = res.json() as { nickname: string; age_band?: string; ageBand?: string };
    expect(profile.nickname).toBe("Test Kid");
  });
});

describe("GET /api/v1/child-profiles — requires consent too", () => {
  it("returns 403 without consent", async () => {
    const { accessToken } = await registerAndGetTokens("e@example.com");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/child-profiles",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ═════ Creative CRUD (WP-C): PATCH/DELETE /child-profiles/:id ═════════════════

async function createProfile(accessToken: string, nickname = "Kid") {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/child-profiles",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { nickname, age_band: "4_6" },
  });
  return res.json() as { id: string; nickname: string };
}

describe("PATCH /api/v1/child-profiles/:id — guardian isolation", () => {
  it("guardian updates own profile (nickname, age_band, preferences)", async () => {
    const { accessToken } = await registerAndGetTokens("g1@example.com");
    await grantConsent(accessToken);
    const profile = await createProfile(accessToken);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/child-profiles/${profile.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        nickname: "Novo Apelido",
        age_band: "7_9",
        preferences: { cor: "azul" },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      nickname: string;
      ageBand: string;
      preferences: Record<string, unknown>;
    };
    expect(body.nickname).toBe("Novo Apelido");
    expect(body.ageBand).toBe("7_9");
    expect(body.preferences).toEqual({ cor: "azul" });
  });

  it("returns 404 when profile belongs to another guardian", async () => {
    const { accessToken: tokenA } = await registerAndGetTokens("g2@example.com");
    const { accessToken: tokenB } = await registerAndGetTokens("g3@example.com");
    await grantConsent(tokenA);
    await grantConsent(tokenB);
    const profileA = await createProfile(tokenA, "Filho de A");

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/child-profiles/${profileA.id}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { nickname: "Invasão" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for invalid age_band", async () => {
    const { accessToken } = await registerAndGetTokens("g4@example.com");
    await grantConsent(accessToken);
    const profile = await createProfile(accessToken);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/child-profiles/${profile.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { age_band: "13_15" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/v1/child-profiles/:id — guardian isolation + soft-delete", () => {
  it("guardian soft-deletes own profile; profile disappears from GET", async () => {
    const { accessToken } = await registerAndGetTokens("g5@example.com");
    await grantConsent(accessToken);
    const profile = await createProfile(accessToken);

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/child-profiles/${profile.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json()).toEqual({ ok: true });

    // Invisível no detalhe e na lista
    const getRes = await app.inject({
      method: "GET",
      url: `/api/v1/child-profiles/${profile.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(getRes.statusCode).toBe(404);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/child-profiles",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(listRes.json() as unknown[]).toHaveLength(0);

    // DELETE de novo → 404 (já soft-deletado)
    const delAgain = await app.inject({
      method: "DELETE",
      url: `/api/v1/child-profiles/${profile.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(delAgain.statusCode).toBe(404);
  });

  it("returns 404 when deleting another guardian's profile", async () => {
    const { accessToken: tokenA } = await registerAndGetTokens("g6@example.com");
    const { accessToken: tokenB } = await registerAndGetTokens("g7@example.com");
    await grantConsent(tokenA);
    await grantConsent(tokenB);
    const profileA = await createProfile(tokenA);

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/child-profiles/${profileA.id}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(404);

    // Perfil de A continua acessível para A
    const stillThere = await app.inject({
      method: "GET",
      url: `/api/v1/child-profiles/${profileA.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(stillThere.statusCode).toBe(200);
  });
});
