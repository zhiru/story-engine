import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { stories } from "../db/schema.js";

type Actor = { id: string; role: "USER" | "MODERATOR" | "ADMIN" };

/**
 * List only APPROVED, non-deleted stories for a universe.
 */
export async function listApproved(universeId: string) {
  return db
    .select({
      id: stories.id,
      title: stories.title,
      createdAt: stories.createdAt,
    })
    .from(stories)
    .where(
      and(
        eq(stories.universeId, universeId),
        eq(stories.moderationStatus, "APPROVED"),
        isNull(stories.deletedAt),
      ),
    )
    .orderBy(desc(stories.createdAt));
}

/**
 * Get a single story:
 * - APPROVED stories are readable by any actor.
 * - PENDING/REJECTED stories are only readable by the owner or ADMIN/MODERATOR.
 * Returns null when the actor should not see the story (caller sends 404).
 */
export async function getReadable(actor: Actor, id: string) {
  const [row] = await db
    .select()
    .from(stories)
    .where(and(eq(stories.id, id), isNull(stories.deletedAt)))
    .limit(1);

  if (!row) return null;

  const isApproved = row.moderationStatus === "APPROVED";
  const isOwner = row.userId === actor.id;
  const isAdmin = actor.role === "ADMIN" || actor.role === "MODERATOR";

  if (!isApproved && !isOwner && !isAdmin) return null;

  return row;
}
