import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { sendError } from "../http/errors.js";
import { getAppSettingsBySlug } from "../repos/appSettings.js";

export async function configRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/config
   * Returns runtime app config read from app_settings for the resolved slug.
   * Mode resolved via x-app-slug header (set by resolveAppContext global hook).
   */
  app.get(
    "/config",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const slug = request.appSlug;
      // Resiliência: slug desconhecido cai no default em vez de quebrar a tela.
      const fallbackSlug = process.env["DEFAULT_APP_SLUG"] ?? "historias-da-gigi";
      const settings =
        (await getAppSettingsBySlug(slug)) ??
        (await getAppSettingsBySlug(fallbackSlug));
      if (!settings) {
        return sendError(reply, 503, "SERVICE_UNAVAILABLE", "App not configured");
      }

      const appMode = settings.appMode as "SINGLE" | "MULTI";

      return reply.code(200).send({
        appMode,
        ...(appMode === "SINGLE"
          ? { singleModeUniverseId: settings.singleModeUniverseId ?? null }
          : {}),
        theme: settings.theme as Record<string, string>,
      });
    },
  );
}
