import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { listApproved, getReadable } from "../repos/stories.js";
import { getUniverseById, canReadUniverse } from "../repos/universes.js";
import { sendError } from "../http/errors.js";

export async function storyRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/universes/:id/stories
   * Lists APPROVED stories for a universe.
   * Acesso ao universo primeiro (SDD §6.4): dono, admin/mod, PUBLIC,
   * ou o universo do modo SINGLE do app; caso contrário 403.
   */
  app.get(
    "/universes/:id/stories",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const universe = await getUniverseById(id);
      if (!universe) {
        return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      }
      if (!canReadUniverse(request.actor, universe, request.singleModeUniverseId)) {
        return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      }

      const list = await listApproved(id);
      return reply.code(200).send(
        list.map((s) => ({
          id: s.id,
          title: s.title,
          createdAt: s.createdAt.toISOString(),
        })),
      );
    },
  );

  /**
   * GET /api/v1/stories/:id
   * Returns a single story (APPROVED, or owner/admin for PENDING).
   */
  app.get(
    "/stories/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const story = await getReadable(request.actor, id);
      if (!story) {
        return sendError(reply, 404, "NOT_FOUND", "Not found");
      }
      return reply.code(200).send({
        id: story.id,
        universeId: story.universeId,
        title: story.title,
        content: story.content,
        moderationStatus: story.moderationStatus,
        createdAt: story.createdAt.toISOString(),
      });
    },
  );
}
