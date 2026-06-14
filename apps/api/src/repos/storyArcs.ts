/**
 * Story arcs repository.
 * Supports optimistic locking via version field.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { storyArcs } from "../db/schema.js";

export async function getStoryArcById(id: string) {
  const [row] = await db
    .select()
    .from(storyArcs)
    .where(and(eq(storyArcs.id, id), isNull(storyArcs.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Update arc summary with optimistic lock.
 * Only updates if the current version matches expectedVersion.
 * Returns true if update succeeded, false if optimistic lock conflict.
 */
export async function updateArcSummary(
  id: string,
  summary: string,
  expectedVersion: number,
): Promise<boolean> {
  const rows = await db
    .update(storyArcs)
    .set({
      summary,
      version: expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(storyArcs.id, id), eq(storyArcs.version, expectedVersion)))
    .returning({ id: storyArcs.id });

  return rows.length > 0;
}
