import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { hasParentalConsentLatest } from "../repos/consent.js";

export async function meRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/me
   * Returns the authenticated user's id, email, role and the server-derived
   * has_parental_consent flag (registro PARENTAL_DATA mais recente com granted).
   */
  app.get("/me", { preHandler: [requireAuth] }, async (request, reply) => {
    // requireAuth já buscou a linha do usuário e anexou em request.actor
    const actor = request.actor;
    const hasParentalConsent = await hasParentalConsentLatest(actor.id);

    return reply.code(200).send({
      id: actor.id,
      email: actor.email,
      role: actor.role,
      has_parental_consent: hasParentalConsent,
    });
  });
}
