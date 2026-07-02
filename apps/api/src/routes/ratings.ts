/**
 * PUT /api/v1/universes/:id/rating — avaliar universo (SDD RF-31, §7.1).
 * Regras: universo deve existir (404), ser PUBLIC e não pertencer ao
 * avaliador (403 FORBIDDEN nos dois casos). Upsert em
 * UNIQUE(universe_id, user_id) + agregado recomputado na mesma transação.
 */
import type { FastifyInstance } from "fastify";
import { RateUniverseInputSchema } from "@storygen/shared";
import { requireAuth } from "../auth/middleware.js";
import { sendError } from "../http/errors.js";
import { getUniverseById } from "../repos/universes.js";
import { upsertRating } from "../repos/ratings.js";

export async function ratingRoutes(app: FastifyInstance): Promise<void> {
  app.put(
    "/universes/:id/rating",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const parsed = RateUniverseInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(
          reply,
          400,
          "VALIDATION_ERROR",
          "Invalid input",
          parsed.error.flatten(),
        );
      }

      const universe = await getUniverseById(id); // já filtra deleted_at
      if (!universe) {
        return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      }
      if (universe.visibility !== "PUBLIC") {
        return sendError(
          reply,
          403,
          "FORBIDDEN",
          "Only PUBLIC universes can be rated",
        );
      }
      if (universe.userId === request.actor.id) {
        return sendError(
          reply,
          403,
          "FORBIDDEN",
          "You cannot rate your own universe",
        );
      }

      const ratingScore = await upsertRating(
        id,
        request.actor.id,
        parsed.data.score,
      );

      return reply.code(200).send({ rating_score: Number(ratingScore) });
    },
  );
}
