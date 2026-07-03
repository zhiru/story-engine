import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { hasParentalConsentLatest } from "../repos/consent.js";
import {
  getLatestSubscriptionWithPlan,
  isSubscriptionActive,
} from "../repos/subscriptions.js";
import { countThisMonth, currentPeriod } from "../repos/usage.js";

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

  /**
   * GET /api/v1/me/subscription (SDD §7.1, RF-51)
   * Estado do plano do usuário: assinatura mais recente + plano + is_active.
   * is_active = ACTIVE, ou PAST_DUE/CANCELED com current_period_end no futuro
   * (acesso residual: carência e período pago restante).
   */
  app.get("/me/subscription", { preHandler: [requireAuth] }, async (request, reply) => {
    const row = await getLatestSubscriptionWithPlan(request.actor.id);
    if (!row) {
      return reply.code(200).send({ subscription: null });
    }

    return reply.code(200).send({
      subscription: {
        plan: {
          id: row.plan.id,
          name: row.plan.name,
          max_universes: row.plan.maxUniverses,
          max_stories_per_month: row.plan.maxStoriesPerMonth,
          price_cents: row.plan.priceCents,
        },
        status: row.sub.status,
        store: row.sub.store,
        current_period_end: row.sub.currentPeriodEnd.toISOString(),
        is_active: isSubscriptionActive(row.sub),
      },
    });
  });

  /**
   * GET /api/v1/me/usage (SDD §7.1, RF-52)
   * Consumo do mês corrente (usage_records) + limites do plano vigente.
   * Sem assinatura → limits: null.
   */
  app.get("/me/usage", { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.actor.id;
    const [storiesGenerated, universesCreated, row] = await Promise.all([
      countThisMonth(userId, "STORY_GENERATED"),
      countThisMonth(userId, "UNIVERSE_CREATED"),
      getLatestSubscriptionWithPlan(userId),
    ]);

    return reply.code(200).send({
      period: currentPeriod(),
      stories_generated: storiesGenerated,
      universes_created: universesCreated,
      limits: row
        ? {
            max_universes: row.plan.maxUniverses,
            max_stories_per_month: row.plan.maxStoriesPerMonth,
          }
        : null,
    });
  });
}
