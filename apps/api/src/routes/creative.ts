import type { FastifyInstance } from "fastify";
import {
  CreateUniverseInputSchema,
  CreateCharacterInputSchema,
  CreateThemeInputSchema,
  CreateStoryArcInputSchema,
} from "@storygen/shared";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { createUniverse } from "../repos/universes.js";
import { getActivePlan } from "../repos/plans.js";
import { countUserUniverses, recordUsage } from "../repos/usage.js";
import { db } from "../db/client.js";
import { characters, themes, storyArcs } from "../db/schema.js";

export async function creativeRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/universes
   * ADMIN or MODERATOR only.
   * Enforces max_universes from the user's plan.
   */
  app.post(
    "/universes",
    { preHandler: [requireAuth, requireRole("ADMIN", "MODERATOR")] },
    async (request, reply) => {
      const parsed = CreateUniverseInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const actor = request.actor;

      // Enforce max_universes limit
      const plan = await getActivePlan(actor.id);
      if (plan) {
        const current = await countUserUniverses(actor.id);
        if (current >= plan.maxUniverses) {
          return reply.code(403).send({
            error: "Universe limit reached",
            limit: plan.maxUniverses,
          });
        }
      }

      const universe = await createUniverse(actor, {
        title: parsed.data.title,
        description: parsed.data.description,
        ...(parsed.data.visibility && { visibility: parsed.data.visibility }),
      });

      // Record usage
      await recordUsage(actor.id, "UNIVERSE_CREATED");

      return reply.code(201).send(universe);
    },
  );

  /**
   * POST /api/v1/universes/:id/characters
   * ADMIN or MODERATOR only.
   */
  app.post(
    "/universes/:id/characters",
    { preHandler: [requireAuth, requireRole("ADMIN", "MODERATOR")] },
    async (request, reply) => {
      const { id: universeId } = request.params as { id: string };
      const parsed = CreateCharacterInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const [character] = await db
        .insert(characters)
        .values({
          universeId,
          name: parsed.data.name,
          classification: parsed.data.classification,
          ageGroup: parsed.data.ageGroup ?? null,
          traits: parsed.data.traits ?? [],
          imageUrl: parsed.data.imageUrl ?? null,
        })
        .returning();

      return reply.code(201).send(character);
    },
  );

  /**
   * POST /api/v1/universes/:id/themes
   * ADMIN or MODERATOR only.
   */
  app.post(
    "/universes/:id/themes",
    { preHandler: [requireAuth, requireRole("ADMIN", "MODERATOR")] },
    async (request, reply) => {
      const { id: universeId } = request.params as { id: string };
      const parsed = CreateThemeInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const [theme] = await db
        .insert(themes)
        .values({
          universeId,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
        })
        .returning();

      return reply.code(201).send(theme);
    },
  );

  /**
   * POST /api/v1/universes/:id/arcs
   * ADMIN or MODERATOR only.
   */
  app.post(
    "/universes/:id/arcs",
    { preHandler: [requireAuth, requireRole("ADMIN", "MODERATOR")] },
    async (request, reply) => {
      const { id: universeId } = request.params as { id: string };
      const parsed = CreateStoryArcInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const [arc] = await db
        .insert(storyArcs)
        .values({
          universeId,
          title: parsed.data.title,
          summary: parsed.data.summary ?? null,
        })
        .returning();

      return reply.code(201).send(arc);
    },
  );
}
