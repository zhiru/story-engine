import type { FastifyInstance } from "fastify";
import {
  CreateUniverseInputSchema,
  CreateCharacterInputSchema,
  CreateThemeInputSchema,
  CreateStoryArcInputSchema,
} from "@storygen/shared";
import { requireAuth } from "../auth/middleware.js";
import { createUniverse } from "../repos/universes.js";
import { getActivePlan } from "../repos/plans.js";
import { countUserUniverses, recordUsage } from "../repos/usage.js";
import { db } from "../db/client.js";
import { characters, themes, storyArcs, universes } from "../db/schema.js";
import { and, eq, isNull } from "drizzle-orm";

/** Returns the universe if actor owns it (or is admin/mod), otherwise null. */
async function assertUniverseAccess(
  universeId: string,
  actorId: string,
  actorRole: "USER" | "MODERATOR" | "ADMIN",
) {
  const [universe] = await db
    .select()
    .from(universes)
    .where(and(eq(universes.id, universeId), isNull(universes.deletedAt)))
    .limit(1);

  if (!universe) return null; // not found

  const isPrivileged = actorRole === "ADMIN" || actorRole === "MODERATOR";
  if (!isPrivileged && universe.userId !== actorId) {
    return false; // found but forbidden
  }
  return universe;
}

export async function creativeRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/universes
   * ADMIN/MODERATOR always allowed.
   * In MULTI mode, regular authenticated users may also create universes.
   */
  app.post(
    "/universes",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = request.actor;
      const appMode = request.appMode;

      // Authorization: ADMIN/MODERATOR always allowed; USER only in MULTI
      const isPrivileged =
        actor.role === "ADMIN" || actor.role === "MODERATOR";
      if (!isPrivileged && appMode !== "MULTI") {
        return reply.code(403).send({ error: "Forbidden" });
      }

      const parsed = CreateUniverseInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid input", details: parsed.error.flatten() });
      }

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
   * GET /api/v1/universes/mine
   * Returns the authenticated user's non-deleted universes.
   * Used by home in MULTI mode.
   */
  app.get(
    "/universes/mine",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = request.actor;
      const rows = await db
        .select()
        .from(universes)
        .where(
          and(eq(universes.userId, actor.id), isNull(universes.deletedAt)),
        );
      return reply.code(200).send(rows);
    },
  );

  /**
   * POST /api/v1/universes/:id/characters
   * ADMIN/MODERATOR always allowed.
   * In MULTI mode, regular users may add characters to their own universes.
   */
  app.post(
    "/universes/:id/characters",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id: universeId } = request.params as { id: string };
      const actor = request.actor;
      const appMode = request.appMode;

      const isPrivileged =
        actor.role === "ADMIN" || actor.role === "MODERATOR";

      if (!isPrivileged) {
        if (appMode !== "MULTI") {
          return reply.code(403).send({ error: "Forbidden" });
        }
        // In MULTI, check universe ownership
        const access = await assertUniverseAccess(
          universeId,
          actor.id,
          actor.role,
        );
        if (access === null) {
          return reply.code(404).send({ error: "Universe not found" });
        }
        if (access === false) {
          return reply.code(403).send({ error: "Forbidden" });
        }
      }

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
   * ADMIN/MODERATOR always allowed.
   * In MULTI mode, regular users may add themes to their own universes.
   */
  app.post(
    "/universes/:id/themes",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id: universeId } = request.params as { id: string };
      const actor = request.actor;
      const appMode = request.appMode;

      const isPrivileged =
        actor.role === "ADMIN" || actor.role === "MODERATOR";

      if (!isPrivileged) {
        if (appMode !== "MULTI") {
          return reply.code(403).send({ error: "Forbidden" });
        }
        const access = await assertUniverseAccess(
          universeId,
          actor.id,
          actor.role,
        );
        if (access === null) {
          return reply.code(404).send({ error: "Universe not found" });
        }
        if (access === false) {
          return reply.code(403).send({ error: "Forbidden" });
        }
      }

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
   * ADMIN/MODERATOR always allowed.
   * In MULTI mode, regular users may add arcs to their own universes.
   */
  app.post(
    "/universes/:id/arcs",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id: universeId } = request.params as { id: string };
      const actor = request.actor;
      const appMode = request.appMode;

      const isPrivileged =
        actor.role === "ADMIN" || actor.role === "MODERATOR";

      if (!isPrivileged) {
        if (appMode !== "MULTI") {
          return reply.code(403).send({ error: "Forbidden" });
        }
        const access = await assertUniverseAccess(
          universeId,
          actor.id,
          actor.role,
        );
        if (access === null) {
          return reply.code(404).send({ error: "Universe not found" });
        }
        if (access === false) {
          return reply.code(403).send({ error: "Forbidden" });
        }
      }

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
