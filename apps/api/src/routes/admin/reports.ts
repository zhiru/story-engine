import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { CreateReportInputSchema, UpdateReportInputSchema } from "@storygen/shared";
import { db } from "../../db/client.js";
import { reports, auditLogs, stories } from "../../db/schema.js";
import { and, asc, eq } from "drizzle-orm";

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/reports
   * Any authenticated user can submit a report.
   */
  app.post(
    "/reports",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = request.actor;

      const parsed = CreateReportInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const [report] = await db
        .insert(reports)
        .values({
          reporterId: actor.id,
          targetType: parsed.data.targetType,
          targetId: parsed.data.targetId,
          reason: parsed.data.reason,
          details: parsed.data.details ?? null,
          status: "OPEN",
        })
        .returning();

      return reply.code(201).send(report);
    },
  );

  /**
   * GET /api/v1/admin/reports
   * List reports. Optional ?status= filter.
   */
  app.get(
    "/admin/reports",
    { preHandler: [requireAuth, requireRole("ADMIN", "MODERATOR")] },
    async (request, reply) => {
      const { status, limit, offset } = request.query as {
        status?: string;
        limit?: string;
        offset?: string;
      };

      const lim = Math.min(Number(limit) || 50, 200);
      const off = Number(offset) || 0;

      const conditions = [];
      if (status) {
        const validStatuses = ["OPEN", "REVIEWING", "ACTIONED", "DISMISSED"];
        if (!validStatuses.includes(status)) {
          return reply.code(400).send({ error: "Invalid status filter" });
        }
        conditions.push(eq(reports.status, status as "OPEN" | "REVIEWING" | "ACTIONED" | "DISMISSED"));
      }

      const rows = await db
        .select()
        .from(reports)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(reports.createdAt))
        .limit(lim)
        .offset(off);

      return reply.code(200).send(rows);
    },
  );

  /**
   * PATCH /api/v1/admin/reports/:id
   * Update report status. On ACTIONED + STORY target, set story moderationStatus=REJECTED.
   */
  app.patch(
    "/admin/reports/:id",
    { preHandler: [requireAuth, requireRole("ADMIN", "MODERATOR")] },
    async (request, reply) => {
      const actor = request.actor;
      const { id } = request.params as { id: string };

      const parsed = UpdateReportInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const [existing] = await db
        .select()
        .from(reports)
        .where(eq(reports.id, id))
        .limit(1);

      if (!existing) {
        return reply.code(404).send({ error: "Report not found" });
      }

      const updateData: Record<string, unknown> = {
        status: parsed.data.status,
        updatedAt: new Date(),
      };
      if (parsed.data.resolvedBy !== undefined) {
        updateData.resolvedBy = parsed.data.resolvedBy;
      } else if (parsed.data.status === "ACTIONED" || parsed.data.status === "DISMISSED") {
        updateData.resolvedBy = actor.id;
      }

      const [updated] = await db
        .update(reports)
        .set(updateData)
        .where(eq(reports.id, id))
        .returning();

      // Side effect: if ACTIONED on a STORY, set moderationStatus=REJECTED
      if (parsed.data.status === "ACTIONED" && existing.targetType === "STORY") {
        await db
          .update(stories)
          .set({ moderationStatus: "REJECTED", updatedAt: new Date() })
          .where(eq(stories.id, existing.targetId));
      }

      await db.insert(auditLogs).values({
        actorId: actor.id,
        action: "REPORT_ACTIONED",
        targetType: "REPORT",
        targetId: id,
        metadata: {
          newStatus: parsed.data.status,
          reportTargetType: existing.targetType,
          reportTargetId: existing.targetId,
        },
      });

      return reply.code(200).send(updated);
    },
  );
}
