import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { UpdateAppSettingsInputSchema } from "@storygen/shared";
import { db } from "../../db/client.js";
import { appSettings, auditLogs } from "../../db/schema.js";
import { asc, eq } from "drizzle-orm";

export async function adminAppSettingsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/admin/app-settings
   * List all app settings rows.
   */
  app.get(
    "/admin/app-settings",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (_request, reply) => {
      const rows = await db
        .select()
        .from(appSettings)
        .orderBy(asc(appSettings.appSlug));

      return reply.code(200).send(rows);
    },
  );

  /**
   * PATCH /api/v1/admin/app-settings/:slug
   * Update app settings by slug.
   */
  app.patch(
    "/admin/app-settings/:slug",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const actor = request.actor;
      const { slug } = request.params as { slug: string };

      const parsed = UpdateAppSettingsInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const [existing] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.appSlug, slug))
        .limit(1);

      if (!existing) {
        return reply.code(404).send({ error: "App settings not found" });
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.theme !== undefined) updateData.theme = parsed.data.theme;
      if (parsed.data.featureFlags !== undefined) updateData.featureFlags = parsed.data.featureFlags;
      if (parsed.data.appMode !== undefined) updateData.appMode = parsed.data.appMode;
      if (parsed.data.singleModeUniverseId !== undefined) {
        updateData.singleModeUniverseId = parsed.data.singleModeUniverseId;
      }

      const [updated] = await db
        .update(appSettings)
        .set(updateData)
        .where(eq(appSettings.appSlug, slug))
        .returning();

      await db.insert(auditLogs).values({
        actorId: actor.id,
        action: "APP_SETTINGS_UPDATED",
        targetType: "APP_SETTINGS",
        targetId: existing.id,
        metadata: { slug, changes: parsed.data },
      });

      return reply.code(200).send(updated);
    },
  );
}
