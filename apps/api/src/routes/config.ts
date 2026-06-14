import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { getAppSettings } from "../repos/appSettings.js";

export async function configRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/config
   * Returns runtime app config read from app_settings (never from build env).
   */
  app.get(
    "/config",
    { preHandler: [requireAuth] },
    async (_request, reply) => {
      const settings = await getAppSettings();
      if (!settings) {
        return reply.code(503).send({ error: "App not configured" });
      }

      return reply.code(200).send({
        appMode: "SINGLE",
        singleModeUniverseId: settings.singleModeUniverseId ?? null,
        theme: settings.theme as Record<string, string>,
      });
    },
  );
}
