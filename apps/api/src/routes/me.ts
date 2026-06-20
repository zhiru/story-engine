import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { getUserById } from "../repos/users.js";

export async function meRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/me
   * Returns the authenticated user's id, email, and role.
   */
  app.get("/me", { preHandler: [requireAuth] }, async (request, reply) => {
    const actor = request.actor;
    const user = await getUserById(actor.id);

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    return reply.code(200).send({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  });
}
