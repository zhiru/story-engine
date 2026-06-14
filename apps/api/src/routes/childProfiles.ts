import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requireAuth, requireConsent } from "../auth/middleware.js";
import {
  createChildProfile,
  listChildProfilesByGuardian,
  getOwnedChildProfile,
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
        return reply
          .code(400)
          .send({ error: "Invalid input", details: parsed.error.flatten() });
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
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.code(200).send(profile);
    },
  );
}
