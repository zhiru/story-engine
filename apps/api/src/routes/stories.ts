import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { listApproved, getReadable } from "../repos/stories.js";

export async function storyRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/universes/:id/stories
   * Lists APPROVED stories for a universe.
   */
  app.get(
    "/universes/:id/stories",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
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
        return reply.code(404).send({ error: "Not found" });
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
