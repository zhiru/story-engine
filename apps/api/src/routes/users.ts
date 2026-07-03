/**
 * DELETE /api/v1/users/:id
 * LGPD right-to-erasure endpoint (SDD 11.2).
 * Allowed if :id === actor.id (self) OR actor.role === 'ADMIN'.
 * Body opcional: { delete_private_stories?: boolean } (padrão false) —
 * true exclui integralmente as histórias PRIVATE do titular.
 */
import type { FastifyInstance } from "fastify";
import { EraseUserInputSchema } from "@storygen/shared";
import { requireAuth } from "../auth/middleware.js";
import { eraseUser } from "../services/lgpdErasure.js";
import { sendError } from "../http/errors.js";

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.delete(
    "/users/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = request.actor;
      const { id } = request.params as { id: string };

      const isSelf = id === actor.id;
      const isAdmin = actor.role === "ADMIN";

      if (!isSelf && !isAdmin) {
        return sendError(reply, 403, "FORBIDDEN", "Not allowed to erase this account.");
      }

      const parsed = EraseUserInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      try {
        const result = await eraseUser(id, {
          deletePrivateStories: parsed.data.delete_private_stories,
        });
        return reply.code(200).send(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erasure failed";
        if (message.includes("not found")) {
          return sendError(reply, 404, "NOT_FOUND", message);
        }
        throw err;
      }
    },
  );
}
