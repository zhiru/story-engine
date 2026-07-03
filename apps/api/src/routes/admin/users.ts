import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { sendError } from "../../http/errors.js";
import { UpdateUserInputSchema } from "@storygen/shared";
import { db } from "../../db/client.js";
import { users, auditLogs } from "../../db/schema.js";
import { and, eq, ilike, isNull, asc } from "drizzle-orm";

export async function adminUserRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/admin/users
   * List non-deleted users. Optional ?q= email filter, ?limit, ?offset.
   */
  app.get(
    "/admin/users",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const { q, limit, offset } = request.query as {
        q?: string;
        limit?: string;
        offset?: string;
      };

      const lim = Math.min(Number(limit) || 50, 200);
      const off = Number(offset) || 0;

      const conditions = [isNull(users.deletedAt)];
      if (q) {
        conditions.push(ilike(users.email, `%${q}%`));
      }

      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          suspendedUntil: users.suspendedUntil,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(and(...conditions))
        .orderBy(asc(users.createdAt))
        .limit(lim)
        .offset(off);

      return reply.code(200).send(rows);
    },
  );

  /**
   * PATCH /api/v1/admin/users/:id
   * Update role and/or suspendedUntil.
   */
  app.patch(
    "/admin/users/:id",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const actor = request.actor;
      const { id } = request.params as { id: string };

      const parsed = UpdateUserInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      const [existing] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1);

      if (!existing) {
        return sendError(reply, 404, "NOT_FOUND", "User not found");
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
      if (parsed.data.suspendedUntil !== undefined) {
        updateData.suspendedUntil =
          parsed.data.suspendedUntil === null
            ? null
            : new Date(parsed.data.suspendedUntil);
      }

      const [updated] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          suspendedUntil: users.suspendedUntil,
          createdAt: users.createdAt,
        });

      // Audit log
      await db.insert(auditLogs).values({
        actorId: actor.id,
        action: "USER_UPDATED",
        targetType: "USER",
        targetId: id,
        metadata: { changes: parsed.data },
      });

      return reply.code(200).send(updated);
    },
  );
}
