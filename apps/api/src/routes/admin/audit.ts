import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { db } from "../../db/client.js";
import { auditLogs } from "../../db/schema.js";
import { and, desc, eq } from "drizzle-orm";

export async function adminAuditRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/admin/audit
   * List audit logs, newest first. Optional ?action=, ?limit, ?offset.
   */
  app.get(
    "/admin/audit",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const { action, limit, offset } = request.query as {
        action?: string;
        limit?: string;
        offset?: string;
      };

      const lim = Math.min(Number(limit) || 50, 200);
      const off = Number(offset) || 0;

      const conditions = [];
      if (action) {
        conditions.push(eq(auditLogs.action, action));
      }

      const rows = await db
        .select()
        .from(auditLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditLogs.createdAt))
        .limit(lim)
        .offset(off);

      return reply.code(200).send(rows);
    },
  );
}
