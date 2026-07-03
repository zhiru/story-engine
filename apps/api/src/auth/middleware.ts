import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccess } from "./jwt.js";
import { hasParentalConsent } from "../repos/consent.js";
import { getUserById } from "../repos/users.js";
import { sendError } from "../http/errors.js";

export const CURRENT_POLICY_VERSION = "1.0";

export type Actor = {
  id: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  /** Campos extras vindos da linha do usuário (evita segunda query downstream). */
  email?: string;
  name?: string;
  suspendedUntil?: Date | null;
};

// Augment Fastify request type
declare module "fastify" {
  interface FastifyRequest {
    actor: Actor;
  }
}

/** Mensagem pt-BR de conta suspensa. */
export function suspendedMessage(until: Date): string {
  return `Conta suspensa até ${until.toISOString()}`;
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    sendError(reply, 401, "UNAUTHORIZED", "Unauthorized");
    return;
  }
  const token = auth.slice(7);
  let payload: ReturnType<typeof verifyAccess>;
  try {
    payload = verifyAccess(token);
  } catch {
    sendError(reply, 401, "UNAUTHORIZED", "Unauthorized");
    return;
  }

  // Estado da conta a cada request: usuário excluído (soft delete) → 401;
  // suspenso (suspended_until no futuro) → 403 SUSPENDED.
  const user = await getUserById(payload.sub); // já filtra deleted_at
  if (!user) {
    sendError(reply, 401, "UNAUTHORIZED", "Unauthorized");
    return;
  }
  if (user.suspendedUntil && user.suspendedUntil > new Date()) {
    sendError(reply, 403, "SUSPENDED", suspendedMessage(user.suspendedUntil));
    return;
  }

  // Role vem do banco (fonte da verdade), não do token — mudanças de papel
  // e suspensões valem imediatamente.
  request.actor = {
    id: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    suspendedUntil: user.suspendedUntil,
  };
}

export function requireRole(...roles: Array<"USER" | "MODERATOR" | "ADMIN">) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.actor) {
      sendError(reply, 401, "UNAUTHORIZED", "Unauthorized");
      return;
    }
    if (!roles.includes(request.actor.role)) {
      sendError(reply, 403, "FORBIDDEN", "Forbidden");
      return;
    }
  };
}

export async function requireConsent(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.actor) {
    sendError(reply, 401, "UNAUTHORIZED", "Unauthorized");
    return;
  }
  const hasConsent = await hasParentalConsent(
    request.actor.id,
    CURRENT_POLICY_VERSION,
  );
  if (!hasConsent) {
    sendError(reply, 403, "FORBIDDEN", "Parental consent required");
    return;
  }
}
