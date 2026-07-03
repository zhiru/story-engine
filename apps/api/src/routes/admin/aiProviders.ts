import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { sendError } from "../../http/errors.js";
import { UpdateAiProviderInputSchema } from "@storygen/shared";
import { db } from "../../db/client.js";
import { aiProviders, auditLogs } from "../../db/schema.js";
import { and, asc, eq, isNull } from "drizzle-orm";

export async function adminAiProviderRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/admin/ai-providers
   * List all non-deleted AI providers.
   */
  app.get(
    "/admin/ai-providers",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (_request, reply) => {
      const rows = await db
        .select()
        .from(aiProviders)
        .where(isNull(aiProviders.deletedAt))
        .orderBy(asc(aiProviders.fallbackOrder));

      return reply.code(200).send(rows);
    },
  );

  /**
   * PATCH /api/v1/admin/ai-providers/:id
   * Update AI provider settings. Never stores API key here.
   */
  app.patch(
    "/admin/ai-providers/:id",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const actor = request.actor;
      const { id } = request.params as { id: string };

      const parsed = UpdateAiProviderInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      const [existing] = await db
        .select()
        .from(aiProviders)
        .where(and(eq(aiProviders.id, id), isNull(aiProviders.deletedAt)))
        .limit(1);

      if (!existing) {
        return sendError(reply, 404, "NOT_FOUND", "AI provider not found");
      }

      const [updated] = await db
        .update(aiProviders)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(aiProviders.id, id))
        .returning();

      await db.insert(auditLogs).values({
        actorId: actor.id,
        action: "AI_PROVIDER_UPDATED",
        targetType: "AI_PROVIDER",
        targetId: id,
        metadata: { changes: parsed.data },
      });

      return reply.code(200).send(updated);
    },
  );
}
