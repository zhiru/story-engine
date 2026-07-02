import { and, desc, eq, isNull, or, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { stories, universes } from "../db/schema.js";
import { keysetLt, type CursorPayload } from "../http/pagination.js";

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

/**
 * Listagem top-level de histórias (SDD §6.4/§7.1) — o requisitante lê:
 * geradas por ele, OU em universos de que é dono, OU
 * (visibility='PUBLIC' AND moderation_status='APPROVED').
 * ADMIN/MODERATOR veem tudo. Filtros opcionais: universe, arc.
 * Busca `limit + 1` linhas (a extra sinaliza próxima página), mais recentes
 * primeiro com desempate por id — cursor {created_at, id}.
 */
export async function listReadable(
  actor: Actor,
  filters: { universeId?: string; storyArcId?: string },
  cursor: CursorPayload | null,
  limit: number,
) {
  const isAdmin = actor.role === "ADMIN" || actor.role === "MODERATOR";

  const conditions: (SQL | undefined)[] = [isNull(stories.deletedAt)];

  if (filters.universeId) {
    conditions.push(eq(stories.universeId, filters.universeId));
  }
  if (filters.storyArcId) {
    conditions.push(eq(stories.storyArcId, filters.storyArcId));
  }
  if (!isAdmin) {
    conditions.push(
      or(
        eq(stories.userId, actor.id), // gerador
        eq(universes.userId, actor.id), // dono do universo
        and(
          eq(stories.visibility, "PUBLIC"),
          eq(stories.moderationStatus, "APPROVED"),
        ),
      ),
    );
  }
  if (cursor) {
    conditions.push(
      keysetLt(
        stories.createdAt,
        stories.id,
        new Date(cursor["created_at"]!),
        cursor["id"]!,
      ),
    );
  }

  return db
    .select({
      id: stories.id,
      universeId: stories.universeId,
      storyArcId: stories.storyArcId,
      title: stories.title,
      visibility: stories.visibility,
      moderationStatus: stories.moderationStatus,
      createdAt: stories.createdAt,
    })
    .from(stories)
    .innerJoin(universes, eq(universes.id, stories.universeId))
    .where(and(...conditions))
    .orderBy(desc(stories.createdAt), desc(stories.id))
    .limit(limit + 1);
}

/** Busca história não deletada por id (sem regra de leitura — para escrita). */
export async function getStoryById(id: string) {
  const [row] = await db
    .select()
    .from(stories)
    .where(and(eq(stories.id, id), isNull(stories.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Atualiza a visibilidade (regras de autorização ficam na rota). */
export async function setStoryVisibility(
  id: string,
  visibility: "PUBLIC" | "PRIVATE" | "PAID",
) {
  const [row] = await db
    .update(stories)
    .set({ visibility, updatedAt: new Date() })
    .where(and(eq(stories.id, id), isNull(stories.deletedAt)))
    .returning();
  return row ?? null;
}
