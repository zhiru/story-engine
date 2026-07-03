/**
 * Feed de descoberta (RF-30): universos PUBLIC não deletados, com nome do
 * dono, ordenáveis por recência ou avaliação, paginados por cursor keyset.
 */
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { universes, users } from "../db/schema.js";
import { keysetLt, type CursorPayload } from "../http/pagination.js";

export type DiscoverySort = "recent" | "top";

export type DiscoveryRow = {
  id: string;
  title: string;
  description: string;
  ratingScore: string; // numeric vem como string do driver
  createdAt: Date;
  ownerName: string;
};

/**
 * Busca `limit + 1` universos públicos (a linha extra sinaliza próxima página
 * para o helper de paginação). Cursor:
 *   recent → {created_at, id} · top → {rating_score, id}
 */
export async function listPublicUniverses(
  sort: DiscoverySort,
  cursor: CursorPayload | null,
  limit: number,
): Promise<DiscoveryRow[]> {
  let cursorWhere: SQL | undefined;
  if (cursor) {
    cursorWhere =
      sort === "top"
        ? keysetLt(
            universes.ratingScore,
            universes.id,
            cursor["rating_score"],
            cursor["id"]!,
          )
        : keysetLt(
            universes.createdAt,
            universes.id,
            new Date(cursor["created_at"]!),
            cursor["id"]!,
          );
  }

  const orderBy =
    sort === "top"
      ? [desc(universes.ratingScore), desc(universes.id)]
      : [desc(universes.createdAt), desc(universes.id)];

  return db
    .select({
      id: universes.id,
      title: universes.title,
      description: universes.description,
      ratingScore: universes.ratingScore,
      createdAt: universes.createdAt,
      ownerName: users.name,
    })
    .from(universes)
    .innerJoin(users, eq(users.id, universes.userId))
    .where(
      and(
        eq(universes.visibility, "PUBLIC"),
        isNull(universes.deletedAt),
        cursorWhere,
      ),
    )
    .orderBy(...orderBy)
    .limit(limit + 1);
}
