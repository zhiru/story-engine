import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { sendError } from "../../http/errors.js";
import { CreatePlanInputSchema, UpdatePlanInputSchema } from "@storygen/shared";
import { db } from "../../db/client.js";
import { plans, auditLogs } from "../../db/schema.js";
import { and, asc, eq, isNull } from "drizzle-orm";

export async function adminPlanRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/admin/plans
   * List all non-deleted plans.
   */
  app.get(
    "/admin/plans",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (_request, reply) => {
      const rows = await db
        .select()
        .from(plans)
        .where(isNull(plans.deletedAt))
        .orderBy(asc(plans.createdAt));

      return reply.code(200).send(rows);
    },
  );

  /**
   * POST /api/v1/admin/plans
   * Create a new plan.
   */
  app.post(
    "/admin/plans",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const actor = request.actor;

      const parsed = CreatePlanInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      const [plan] = await db
        .insert(plans)
        .values({
          name: parsed.data.name,
          maxUniverses: parsed.data.maxUniverses,
          maxStoriesPerMonth: parsed.data.maxStoriesPerMonth,
          priceCents: parsed.data.priceCents,
          revenuecatEntitlement: parsed.data.revenuecatEntitlement ?? null,
        })
        .returning();

      await db.insert(auditLogs).values({
        actorId: actor.id,
        action: "PLAN_CREATED",
        targetType: "PLAN",
        targetId: plan!.id,
        metadata: { plan: parsed.data },
      });

      return reply.code(201).send(plan);
    },
  );

  /**
   * PATCH /api/v1/admin/plans/:id
   * Update a plan.
   */
  app.patch(
    "/admin/plans/:id",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const actor = request.actor;
      const { id } = request.params as { id: string };

      const parsed = UpdatePlanInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      const [existing] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, id), isNull(plans.deletedAt)))
        .limit(1);

      if (!existing) {
        return sendError(reply, 404, "NOT_FOUND", "Plan not found");
      }

      const [updated] = await db
        .update(plans)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(plans.id, id))
        .returning();

      await db.insert(auditLogs).values({
        actorId: actor.id,
        action: "PLAN_UPDATED",
        targetType: "PLAN",
        targetId: id,
        metadata: { changes: parsed.data },
      });

      return reply.code(200).send(updated);
    },
  );

  /**
   * DELETE /api/v1/admin/plans/:id
   * Soft-delete a plan.
   */
  app.delete(
    "/admin/plans/:id",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const actor = request.actor;
      const { id } = request.params as { id: string };

      const [existing] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, id), isNull(plans.deletedAt)))
        .limit(1);

      if (!existing) {
        return sendError(reply, 404, "NOT_FOUND", "Plan not found");
      }

      await db
        .update(plans)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(plans.id, id));

      await db.insert(auditLogs).values({
        actorId: actor.id,
        action: "PLAN_DELETED",
        targetType: "PLAN",
        targetId: id,
        metadata: {},
      });

      return reply.code(200).send({ ok: true });
    },
  );
}
