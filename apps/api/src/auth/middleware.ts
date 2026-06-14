import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccess } from "./jwt.js";
import { hasParentalConsent } from "../repos/consent.js";

export const CURRENT_POLICY_VERSION = "1.0";

export type Actor = {
  id: string;
  role: "USER" | "MODERATOR" | "ADMIN";
};

// Augment Fastify request type
declare module "fastify" {
  interface FastifyRequest {
    actor: Actor;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  try {
    const payload = verifyAccess(token);
    request.actor = { id: payload.sub, role: payload.role };
  } catch {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }
}

export function requireRole(...roles: Array<"USER" | "MODERATOR" | "ADMIN">) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.actor) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(request.actor.role)) {
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
  };
}

export async function requireConsent(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.actor) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  const hasConsent = await hasParentalConsent(
    request.actor.id,
    CURRENT_POLICY_VERSION,
  );
  if (!hasConsent) {
    reply.code(403).send({ error: "Parental consent required" });
    return;
  }
}
