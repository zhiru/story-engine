import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { plans, subscriptions } from "../db/schema.js";

/**
 * Returns the active plan for a user, or null if no active subscription.
 */
export async function getActivePlan(userId: string) {
  const [row] = await db
    .select({ plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  return row?.plan ?? null;
}
