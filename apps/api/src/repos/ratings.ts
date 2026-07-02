/**
 * Avaliações de universos (RF-31): 1..5 estrelas, uma por usuário por
 * universo (UNIQUE(universe_id, user_id)); `universes.rating_score` é o
 * agregado materializado round(avg(score), 2).
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { ratings, universes } from "../db/schema.js";

/**
 * Upsert da avaliação + recomputa o agregado NA MESMA transação, para o
 * rating_score nunca divergir das linhas de ratings.
 * Retorna o novo rating_score (string numeric, ex. "4.50").
 */
export async function upsertRating(
  universeId: string,
  userId: string,
  score: number,
): Promise<string> {
  return db.transaction(async (tx) => {
    await tx
      .insert(ratings)
      .values({ universeId, userId, score })
      .onConflictDoUpdate({
        target: [ratings.universeId, ratings.userId],
        set: { score, updatedAt: new Date() },
      });

    const [agg] = await tx
      .select({
        avg: sql<string>`round(avg(${ratings.score}), 2)`,
      })
      .from(ratings)
      .where(eq(ratings.universeId, universeId));

    const ratingScore = agg?.avg ?? "0.00";

    await tx
      .update(universes)
      .set({ ratingScore, updatedAt: new Date() })
      .where(eq(universes.id, universeId));

    return ratingScore;
  });
}
