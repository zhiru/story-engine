import { and, count, eq, isNull, sum } from "drizzle-orm";
import { db } from "../db/client.js";
import { universes, usageRecords } from "../db/schema.js";

export function currentPeriod(): string {
  const now = new Date();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}-${mm}`;
}

/**
 * Count non-deleted universes owned by a user.
 */
export async function countUserUniverses(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(universes)
    .where(and(eq(universes.userId, userId), isNull(universes.deletedAt)));
  return row?.count ?? 0;
}

/**
 * Count total quantity of a metric for a user in the current calendar month.
 */
export async function countThisMonth(
  userId: string,
  metric: "STORY_GENERATED" | "UNIVERSE_CREATED",
): Promise<number> {
  const period = currentPeriod();
  const [row] = await db
    .select({ total: sum(usageRecords.quantity) })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.userId, userId),
        eq(usageRecords.metric, metric),
        eq(usageRecords.period, period),
      ),
    );
  return Number(row?.total ?? 0);
}

/**
 * Record a usage event for the current calendar month.
 */
export async function recordUsage(
  userId: string,
  metric: "STORY_GENERATED" | "UNIVERSE_CREATED",
) {
  await db.insert(usageRecords).values({
    userId,
    metric,
    period: currentPeriod(),
    quantity: 1,
  });
}
