/**
 * POST /api/v1/stories/generate
 * Authenticated + parental consent required.
 * Validates input, calls the generation service, maps errors to error envelope.
 */

import type { FastifyInstance } from "fastify";
import { GenerateStoryInputSchema } from "@storygen/shared";
import { requireAuth, requireConsent } from "../auth/middleware.js";
import { generateStory, GenerationError } from "../services/generateStory.js";
import { sendError } from "../http/errors.js";

export async function generateRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/stories/generate",
    { preHandler: [requireAuth, requireConsent] },
    async (request, reply) => {
      const parsed = GenerateStoryInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(
          reply,
          400,
          "VALIDATION_ERROR",
          "Dados inválidos.",
          parsed.error.flatten(),
        );
      }

      try {
        const result = await generateStory(request.actor, parsed.data, {
          appMode: request.appMode,
          singleModeUniverseId: request.singleModeUniverseId,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof GenerationError) {
          const statusMap: Record<string, number> = {
            NO_ACTIVE_SUBSCRIPTION: 403,
            QUOTA_EXCEEDED: 402,
            CONTENT_REJECTED: 422,
            GENERATION_FAILED: 503,
            UNIVERSE_ACCESS_DENIED: 403,
            CHILD_PROFILE_NOT_FOUND: 404,
            THEME_NOT_FOUND: 404,
          };
          const status = statusMap[err.code] ?? 500;
          return sendError(reply, status, err.code, err.message);
        }
        // Unexpected error
        console.error("Unexpected error in /stories/generate:", err);
        return sendError(
          reply,
          503,
          "GENERATION_FAILED",
          "Erro inesperado. Tente novamente.",
        );
      }
    },
  );
}
