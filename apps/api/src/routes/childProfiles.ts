import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { UpdateChildProfileInputSchema } from "@storygen/shared";
import { requireAuth, requireConsent } from "../auth/middleware.js";
import { sendError } from "../http/errors.js";
import {
  createChildProfile,
  listChildProfilesByGuardian,
  getOwnedChildProfile,
  updateOwnedChildProfile,
  softDeleteOwnedChildProfile,
} from "../repos/childProfiles.js";

const CreateChildProfileSchema = z.object({
  nickname: z.string().min(1).max(255),
  age_band: z.enum(["0_3", "4_6", "7_9", "10_12"]),
  preferences: z.record(z.unknown()).optional(),
});

export async function childProfileRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /child-profiles — list scoped to authenticated guardian
  app.get(
    "/child-profiles",
    { preHandler: [requireAuth, requireConsent] },
    async (request, reply) => {
      const profiles = await listChildProfilesByGuardian(request.actor);
      return reply.code(200).send(profiles);
    },
  );

  // POST /child-profiles — create scoped to authenticated guardian
  app.post(
    "/child-profiles",
    { preHandler: [requireAuth, requireConsent] },
    async (request, reply) => {
      const parsed = CreateChildProfileSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }
      const { nickname, age_band, preferences } = parsed.data;

      const profile = await createChildProfile(request.actor, {
        nickname,
        ageBand: age_band,
        preferences: preferences as Record<string, unknown> | undefined,
      });

      return reply.code(201).send(profile);
    },
  );

  // GET /child-profiles/:id
  app.get(
    "/child-profiles/:id",
    { preHandler: [requireAuth, requireConsent] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const profile = await getOwnedChildProfile(request.actor, id);
      if (!profile) {
        return sendError(reply, 404, "NOT_FOUND", "Not found");
      }
      return reply.code(200).send(profile);
    },
  );

  // PATCH /child-profiles/:id — só o próprio responsável; 404 se não existir/não for dele
  app.patch(
    "/child-profiles/:id",
    { preHandler: [requireAuth, requireConsent] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpdateChildProfileInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }
      const { nickname, age_band, preferences } = parsed.data;

      const updated = await updateOwnedChildProfile(request.actor, id, {
        ...(nickname !== undefined && { nickname }),
        ...(age_band !== undefined && { ageBand: age_band }),
        ...(preferences !== undefined && {
          preferences: preferences as Record<string, unknown>,
        }),
      });
      if (!updated) {
        return sendError(reply, 404, "NOT_FOUND", "Not found");
      }
      return reply.code(200).send(updated);
    },
  );

  // DELETE /child-profiles/:id — soft-delete; só o próprio responsável
  app.delete(
    "/child-profiles/:id",
    { preHandler: [requireAuth, requireConsent] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = await softDeleteOwnedChildProfile(request.actor, id);
      if (!deleted) {
        return sendError(reply, 404, "NOT_FOUND", "Not found");
      }
      return reply.code(200).send({ ok: true });
    },
  );
}
