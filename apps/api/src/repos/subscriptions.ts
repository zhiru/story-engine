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
 * Regra de acesso da assinatura (RF-51), espelhando a semântica de
 * services/generateStory.ts#getActiveSubscriptionPlan (ACTIVE exige
 * current_period_end no futuro) e estendendo para os estados com acesso
 * residual: PAST_DUE (dentro da carência já somada ao current_period_end)
 * e CANCELED (acesso até o fim do período pago).
 */
export function isSubscriptionActive(sub: {
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  currentPeriodEnd: Date;
}): boolean {
  if (sub.status === "EXPIRED") return false;
  return sub.currentPeriodEnd > new Date();
}
