import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { universes, usageRecords } from "../db/schema.js";

function currentPeriod(): string {
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
