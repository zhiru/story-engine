import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { plans, subscriptions } from "../db/schema.js";

const TRIAL_SUBSCRIPTION_TTL_DAYS = 30;

/**
 * Creates an ACTIVE subscription on the TRIAL plan for a newly registered user.
 * current_period_end = now + 30 days.
 */
export async function createTrialSubscription(
  userId: string,
  trialPlanId: string,
): Promise<void> {
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + TRIAL_SUBSCRIPTION_TTL_DAYS);

  await db.insert(subscriptions).values({
    userId,
    planId: trialPlanId,
    status: "ACTIVE",
    store: "STRIPE",
    currentPeriodEnd: periodEnd,
  });
}

// ===== Billing (WP-A) =====

/**
 * Latest non-deleted subscription of a user, joined with its plan.
 * "Latest" = most recent created_at (a máquina de estados do webhook sempre
 * atualiza essa linha).
 */
export async function getLatestSubscriptionWithPlan(userId: string) {
  const [row] = await db
    .select({ sub: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(and(eq(subscriptions.userId, userId), isNull(subscriptions.deletedAt)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Estados de assinatura que concedem acesso (residual) enquanto
 * current_period_end estiver no futuro (RF-51):
 * - ACTIVE: assinatura vigente;
 * - PAST_DUE: dentro da carência já somada ao current_period_end;
 * - CANCELED: acesso até o fim do período pago.
 * EXPIRED nunca concede acesso. Predicado compartilhado por
 * isSubscriptionActive() (/me/subscription) e por
 * services/generateStory.ts#getActiveSubscriptionPlan() (gate de geração),
 * evitando a divergência em que /me mostra is_active=true mas a geração
 * respondia 403 NO_ACTIVE_SUBSCRIPTION.
 */
export const RESIDUAL_ACCESS_STATUSES = [
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
] as const;

/**
 * Regra de acesso da assinatura (RF-51) — mesma semântica de
 * RESIDUAL_ACCESS_STATUSES: qualquer estado exceto EXPIRED concede acesso
 * enquanto current_period_end estiver no futuro.
 */
export function isSubscriptionActive(sub: {
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  currentPeriodEnd: Date;
}): boolean {
  if (sub.status === "EXPIRED") return false;
  return sub.currentPeriodEnd > new Date();
}
