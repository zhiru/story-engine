import { db } from "../db/client.js";
import { subscriptions } from "../db/schema.js";

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
