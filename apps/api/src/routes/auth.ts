import type { FastifyInstance } from "fastify";
import {
  RegisterInputSchema,
  LoginInputSchema,
  ConsentInputSchema,
} from "@storygen/shared";
import { hashPassword, verifyPassword } from "../auth/hash.js";
import { signAccess, signRefresh, verifyRefresh } from "../auth/jwt.js";
import { createUser, getUserByEmail, getUserById } from "../repos/users.js";
import {
  issueRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  sha256,
} from "../repos/refreshTokens.js";
import { recordConsent } from "../repos/consent.js";
import { requireAuth } from "../auth/middleware.js";

const REFRESH_TOKEN_TTL_DAYS = 7;

function refreshExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_TTL_DAYS);
  return d;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /auth/register
  app.post("/auth/register", async (request, reply) => {
    const parsed = RegisterInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const { name, email, password } = parsed.data;

    // Check for duplicate email
    const existing = await getUserByEmail(email);
    if (existing) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({ name, email, passwordHash });

    const accessToken = signAccess({ sub: user.id, role: user.role });
    const refreshToken = signRefresh({ sub: user.id });
    await issueRefreshToken(user.id, refreshToken, refreshExpiresAt());

    return reply.code(201).send({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  });

  // POST /auth/login
  app.post("/auth/login", async (request, reply) => {
    const parsed = LoginInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input" });
    }
    const { email, password } = parsed.data;

    const user = await getUserByEmail(email);
    if (!user || user.deletedAt !== null) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const accessToken = signAccess({ sub: user.id, role: user.role });
    const refreshToken = signRefresh({ sub: user.id });
    await issueRefreshToken(user.id, refreshToken, refreshExpiresAt());

    return reply.code(200).send({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  });

  // POST /auth/refresh
  app.post("/auth/refresh", async (request, reply) => {
    const body = request.body as { refresh_token?: string } | null;
    const token = body?.refresh_token;
    if (!token) {
      return reply.code(400).send({ error: "refresh_token required" });
    }

    // Verify JWT signature first
    let payload: { sub: string };
    try {
      payload = verifyRefresh(token);
    } catch {
      return reply.code(401).send({ error: "Invalid refresh token" });
    }

    // Check token in DB (not revoked, not expired)
    const stored = await findValidRefreshToken(payload.sub, token);
    if (!stored) {
      return reply.code(401).send({ error: "Token revoked or expired" });
    }

    // Revoke old token
    await revokeRefreshToken(stored.id);

    // Get user
    const user = await getUserById(payload.sub);
    if (!user) {
      return reply.code(401).send({ error: "User not found" });
    }

    // Issue new pair
    const newAccessToken = signAccess({ sub: user.id, role: user.role });
    const newRefreshToken = signRefresh({ sub: user.id });
    await issueRefreshToken(user.id, newRefreshToken, refreshExpiresAt());

    return reply.code(200).send({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  });

  // POST /auth/logout
  app.post(
    "/auth/logout",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = request.body as { refresh_token?: string } | null;
      const token = body?.refresh_token;
      if (!token) {
        return reply.code(400).send({ error: "refresh_token required" });
      }

      let payload: { sub: string };
      try {
        payload = verifyRefresh(token);
      } catch {
        return reply.code(400).send({ error: "Invalid refresh token" });
      }

      const stored = await findValidRefreshToken(payload.sub, token);
      if (stored) {
        await revokeRefreshToken(stored.id);
      }

      return reply.code(200).send({ message: "Logged out" });
    },
  );

  // POST /auth/consent
  app.post(
    "/auth/consent",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = ConsentInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
      }
      const { consent_type, policy_version, granted } = parsed.data;
      const ipAddress =
        (request.headers["x-forwarded-for"] as string) ||
        request.ip ||
        undefined;

      await recordConsent({
        userId: request.actor.id,
        consentType: consent_type,
        policyVersion: policy_version,
        granted,
        ipAddress,
      });

      return reply.code(201).send({ message: "Consent recorded" });
    },
  );
}
