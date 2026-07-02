import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CreateUniverseInputSchema,
  CreateCharacterInputSchema,
  CreateThemeInputSchema,
  CreateStoryArcInputSchema,
  UpdateCharacterInputSchema,
  UpdateThemeInputSchema,
  UpdateUniverseInputSchema,
  UpdateStoryArcInputSchema,
} from "@storygen/shared";
import { requireAuth } from "../auth/middleware.js";
import { sendError } from "../http/errors.js";
import {
  createUniverse,
  getUniverseById,
  canReadUniverse,
  updateUniverse,
  softDeleteUniverseCascade,
} from "../repos/universes.js";
import { getActivePlan } from "../repos/plans.js";
import { countUserUniverses, recordUsage } from "../repos/usage.js";
import { containsBlocked } from "../ai/sanitize.js";
import { db } from "../db/client.js";
import { characters, themes, storyArcs, universes } from "../db/schema.js";
import { and, asc, desc, eq, isNull, lt, or } from "drizzle-orm";

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

// ── Blocklist gate (SDD 8.2) ─────────────────────────────────────────────────
// Nomes/descrições de entidades criativas entram no prompt de geração →
// mesma checagem de blocklist do user_guidance na criação/edição.

const CONTENT_REJECTED_MSG = "Conteúdo inadequado para o público infantil.";

function isBlockedContent(
  ...parts: Array<string | string[] | null | undefined>
): boolean {
  const text = parts
    .flatMap((p) => (Array.isArray(p) ? p : [p]))
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .join(" ");
  return text.length > 0 && containsBlocked(text);
}

// ── Cursor-lite pagination (local ao arquivo; keyset created_at/id) ──────────

const ListUniversesQuerySchema = z.object({
  scope: z.enum(["mine", "public"]).default("mine"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, "utf8").toString(
    "base64url",
  );
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.lastIndexOf("|");
    if (sep === -1) return null;
    const createdAt = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
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
        return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      }

      const parsed = CreateUniverseInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      // Blocklist (SDD 8.2): título+descrição entram no prompt
      if (isBlockedContent(parsed.data.title, parsed.data.description)) {
        return sendError(reply, 422, "CONTENT_REJECTED", CONTENT_REJECTED_MSG);
      }

      // Enforce max_universes limit
      const plan = await getActivePlan(actor.id);
      if (plan) {
        const current = await countUserUniverses(actor.id);
        if (current >= plan.maxUniverses) {
          return sendError(
            reply,
            403,
            "QUOTA_EXCEEDED",
            "Universe limit reached",
            { limit: plan.maxUniverses },
          );
        }
      }

      const universe = await createUniverse(actor, {
        title: parsed.data.title,
        description: parsed.data.description,
        ...(parsed.data.visibility && { visibility: parsed.data.visibility }),
        ...(parsed.data.location_context !== undefined && {
          locationContext: parsed.data.location_context,
        }),
        ...(parsed.data.latitude !== undefined && {
          latitude: String(parsed.data.latitude),
        }),
        ...(parsed.data.longitude !== undefined && {
          longitude: String(parsed.data.longitude),
        }),
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
   * GET /api/v1/universes?scope=mine|public&cursor=&limit=
   * Paginação cursor-lite por keyset (created_at desc, id desc), máx. 50.
   */
  app.get(
    "/universes",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = request.actor;

      const parsedQuery = ListUniversesQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid query", parsedQuery.error.flatten());
      }
      const { scope, cursor, limit } = parsedQuery.data;

      let cursorFilter;
      if (cursor !== undefined) {
        const decoded = decodeCursor(cursor);
        if (!decoded) {
          return sendError(reply, 400, "VALIDATION_ERROR", "Invalid cursor");
        }
        cursorFilter = or(
          lt(universes.createdAt, decoded.createdAt),
          and(
            eq(universes.createdAt, decoded.createdAt),
            lt(universes.id, decoded.id),
          ),
        );
      }

      const scopeFilter =
        scope === "public"
          ? eq(universes.visibility, "PUBLIC")
          : eq(universes.userId, actor.id);

      const rows = await db
        .select()
        .from(universes)
        .where(and(scopeFilter, isNull(universes.deletedAt), cursorFilter))
        .orderBy(desc(universes.createdAt), desc(universes.id))
        .limit(limit + 1); // +1 para saber se há próxima página

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const last = items[items.length - 1];

      return reply.code(200).send({
        items,
        next_cursor: hasMore && last ? encodeCursor(last) : null,
      });
    },
  );

  /**
   * GET /api/v1/universes/:id
   * Leitura via canReadUniverse (dono, admin/mod, PUBLIC, ou universo do SINGLE).
   */
  app.get(
    "/universes/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const actor = request.actor;

      const universe = await getUniverseById(id);
      if (!universe) {
        return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      }
      if (!canReadUniverse(actor, universe, request.singleModeUniverseId)) {
        return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      }
      return reply.code(200).send(universe);
    },
  );

  /**
   * PATCH /api/v1/universes/:id
   * MULTI: dono (ou admin/mod). SINGLE: apenas ADMIN/MODERATOR (RF-10).
   */
  app.patch(
    "/universes/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const actor = request.actor;
      const appMode = request.appMode;

      const isPrivileged = actor.role === "ADMIN" || actor.role === "MODERATOR";
      if (!isPrivileged && appMode !== "MULTI") {
        return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      }
      const access = await assertUniverseAccess(id, actor.id, actor.role);
      if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      if (access === false) return sendError(reply, 403, "FORBIDDEN", "Forbidden");

      const parsed = UpdateUniverseInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      // Blocklist (SDD 8.2) nos campos textuais editados
      if (isBlockedContent(parsed.data.title, parsed.data.description)) {
        return sendError(reply, 422, "CONTENT_REJECTED", CONTENT_REJECTED_MSG);
      }

      const { title, description, visibility, location_context, latitude, longitude } =
        parsed.data;
      const updated = await updateUniverse(id, {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(visibility !== undefined && { visibility }),
        ...(location_context !== undefined && { locationContext: location_context }),
        ...(latitude !== undefined && {
          latitude: latitude === null ? null : String(latitude),
        }),
        ...(longitude !== undefined && {
          longitude: longitude === null ? null : String(longitude),
        }),
      });
      if (!updated) return sendError(reply, 404, "NOT_FOUND", "Universe not found");

      return reply.code(200).send(updated);
    },
  );

  /**
   * DELETE /api/v1/universes/:id
   * Soft-delete do universo E filhos (characters/themes/story_arcs) em
   * transação (SDD 6.1). Stories permanecem (histórico do gerador).
   */
  app.delete(
    "/universes/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const actor = request.actor;
      const appMode = request.appMode;

      const isPrivileged = actor.role === "ADMIN" || actor.role === "MODERATOR";
      if (!isPrivileged && appMode !== "MULTI") {
        return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      }
      const access = await assertUniverseAccess(id, actor.id, actor.role);
      if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      if (access === false) return sendError(reply, 403, "FORBIDDEN", "Forbidden");

      await softDeleteUniverseCascade(id);

      return reply.code(200).send({ ok: true });
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
          return sendError(reply, 403, "FORBIDDEN", "Forbidden");
        }
        // In MULTI, check universe ownership
        const access = await assertUniverseAccess(
          universeId,
          actor.id,
          actor.role,
        );
        if (access === null) {
          return sendError(reply, 404, "NOT_FOUND", "Universe not found");
        }
        if (access === false) {
          return sendError(reply, 403, "FORBIDDEN", "Forbidden");
        }
      }

      const parsed = CreateCharacterInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      // Blocklist (SDD 8.2): nome+traços entram no prompt
      if (isBlockedContent(parsed.data.name, parsed.data.traits)) {
        return sendError(reply, 422, "CONTENT_REJECTED", CONTENT_REJECTED_MSG);
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
          return sendError(reply, 403, "FORBIDDEN", "Forbidden");
        }
        const access = await assertUniverseAccess(
          universeId,
          actor.id,
          actor.role,
        );
        if (access === null) {
          return sendError(reply, 404, "NOT_FOUND", "Universe not found");
        }
        if (access === false) {
          return sendError(reply, 403, "FORBIDDEN", "Forbidden");
        }
      }

      const parsed = CreateThemeInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      // Blocklist (SDD 8.2): título+descrição entram no prompt
      if (isBlockedContent(parsed.data.title, parsed.data.description)) {
        return sendError(reply, 422, "CONTENT_REJECTED", CONTENT_REJECTED_MSG);
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
          return sendError(reply, 403, "FORBIDDEN", "Forbidden");
        }
        const access = await assertUniverseAccess(
          universeId,
          actor.id,
          actor.role,
        );
        if (access === null) {
          return sendError(reply, 404, "NOT_FOUND", "Universe not found");
        }
        if (access === false) {
          return sendError(reply, 403, "FORBIDDEN", "Forbidden");
        }
      }

      const parsed = CreateStoryArcInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
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

  /**
   * GET /api/v1/universes/:id/arcs
   * Leitura herda a regra do universo pai (canReadUniverse — SDD 6.4).
   */
  app.get(
    "/universes/:id/arcs",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id: universeId } = request.params as { id: string };
      const actor = request.actor;

      const universe = await getUniverseById(universeId);
      if (!universe) {
        return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      }
      if (!canReadUniverse(actor, universe, request.singleModeUniverseId)) {
        return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      }

      const rows = await db
        .select({
          id: storyArcs.id,
          title: storyArcs.title,
          summary: storyArcs.summary,
          version: storyArcs.version,
          isActive: storyArcs.isActive,
          createdAt: storyArcs.createdAt,
        })
        .from(storyArcs)
        .where(and(eq(storyArcs.universeId, universeId), isNull(storyArcs.deletedAt)))
        .orderBy(asc(storyArcs.createdAt));

      return reply.code(200).send(rows);
    },
  );

  /**
   * PATCH /api/v1/universes/:id/arcs/:aid
   * Editáveis: title e isActive apenas — summary/version pertencem ao
   * pipeline de geração (RF-13, lock otimista).
   */
  app.patch(
    "/universes/:id/arcs/:aid",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id: universeId, aid } = request.params as { id: string; aid: string };
      const actor = request.actor;
      const appMode = request.appMode;

      const isPrivileged = actor.role === "ADMIN" || actor.role === "MODERATOR";

      if (!isPrivileged) {
        if (appMode !== "MULTI") return sendError(reply, 403, "FORBIDDEN", "Forbidden");
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
        if (access === false) return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      } else {
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      }

      const parsed = UpdateStoryArcInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      const [existing] = await db
        .select()
        .from(storyArcs)
        .where(and(eq(storyArcs.id, aid), eq(storyArcs.universeId, universeId), isNull(storyArcs.deletedAt)))
        .limit(1);

      if (!existing) return sendError(reply, 404, "NOT_FOUND", "Story arc not found");

      const [updated] = await db
        .update(storyArcs)
        .set({
          ...(parsed.data.title !== undefined && { title: parsed.data.title }),
          ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
          updatedAt: new Date(),
        })
        .where(eq(storyArcs.id, aid))
        .returning();

      return reply.code(200).send(updated);
    },
  );

  // ── Character CRUD (list / update / delete) ──────────────────────────────

  /**
   * GET /api/v1/universes/:id/characters
   * List non-deleted characters ordered by createdAt.
   */
  app.get(
    "/universes/:id/characters",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id: universeId } = request.params as { id: string };
      const actor = request.actor;
      const appMode = request.appMode;

      const isPrivileged = actor.role === "ADMIN" || actor.role === "MODERATOR";

      if (!isPrivileged) {
        if (appMode !== "MULTI") {
          return sendError(reply, 403, "FORBIDDEN", "Forbidden");
        }
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
        if (access === false) return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      } else {
        // Privileged: still confirm universe exists
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      }

      const rows = await db
        .select()
        .from(characters)
        .where(and(eq(characters.universeId, universeId), isNull(characters.deletedAt)))
        .orderBy(asc(characters.createdAt));

      return reply.code(200).send(rows);
    },
  );

  /**
   * PATCH /api/v1/universes/:id/characters/:cid
   * Update character fields (all optional).
   */
  app.patch(
    "/universes/:id/characters/:cid",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id: universeId, cid } = request.params as { id: string; cid: string };
      const actor = request.actor;
      const appMode = request.appMode;

      const isPrivileged = actor.role === "ADMIN" || actor.role === "MODERATOR";

      if (!isPrivileged) {
        if (appMode !== "MULTI") return sendError(reply, 403, "FORBIDDEN", "Forbidden");
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
        if (access === false) return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      } else {
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      }

      const parsed = UpdateCharacterInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      // Blocklist (SDD 8.2) nos campos textuais editados
      if (isBlockedContent(parsed.data.name, parsed.data.traits)) {
        return sendError(reply, 422, "CONTENT_REJECTED", CONTENT_REJECTED_MSG);
      }

      const [existing] = await db
        .select()
        .from(characters)
        .where(and(eq(characters.id, cid), eq(characters.universeId, universeId), isNull(characters.deletedAt)))
        .limit(1);

      if (!existing) return sendError(reply, 404, "NOT_FOUND", "Character not found");

      const [updated] = await db
        .update(characters)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(characters.id, cid))
        .returning();

      return reply.code(200).send(updated);
    },
  );

  /**
   * DELETE /api/v1/universes/:id/characters/:cid
   * Soft-delete a character.
   */
  app.delete(
    "/universes/:id/characters/:cid",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id: universeId, cid } = request.params as { id: string; cid: string };
      const actor = request.actor;
      const appMode = request.appMode;

      const isPrivileged = actor.role === "ADMIN" || actor.role === "MODERATOR";

      if (!isPrivileged) {
        if (appMode !== "MULTI") return sendError(reply, 403, "FORBIDDEN", "Forbidden");
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
        if (access === false) return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      } else {
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      }

      const [existing] = await db
        .select()
        .from(characters)
        .where(and(eq(characters.id, cid), eq(characters.universeId, universeId), isNull(characters.deletedAt)))
        .limit(1);

      if (!existing) return sendError(reply, 404, "NOT_FOUND", "Character not found");

      await db
        .update(characters)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(characters.id, cid));

      return reply.code(200).send({ ok: true });
    },
  );

  // ── Theme CRUD (list / update / delete) ──────────────────────────────────

  /**
   * GET /api/v1/universes/:id/themes
   * List non-deleted themes ordered by createdAt.
   */
  app.get(
    "/universes/:id/themes",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id: universeId } = request.params as { id: string };
      const actor = request.actor;
      const appMode = request.appMode;

      const isPrivileged = actor.role === "ADMIN" || actor.role === "MODERATOR";

      if (!isPrivileged) {
        if (appMode !== "MULTI") return sendError(reply, 403, "FORBIDDEN", "Forbidden");
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
        if (access === false) return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      } else {
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      }

      const rows = await db
        .select()
        .from(themes)
        .where(and(eq(themes.universeId, universeId), isNull(themes.deletedAt)))
        .orderBy(asc(themes.createdAt));

      return reply.code(200).send(rows);
    },
  );

  /**
   * PATCH /api/v1/universes/:id/themes/:tid
   * Update theme fields (all optional).
   */
  app.patch(
    "/universes/:id/themes/:tid",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id: universeId, tid } = request.params as { id: string; tid: string };
      const actor = request.actor;
      const appMode = request.appMode;

      const isPrivileged = actor.role === "ADMIN" || actor.role === "MODERATOR";

      if (!isPrivileged) {
        if (appMode !== "MULTI") return sendError(reply, 403, "FORBIDDEN", "Forbidden");
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
        if (access === false) return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      } else {
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      }

      const parsed = UpdateThemeInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      // Blocklist (SDD 8.2) nos campos textuais editados
      if (isBlockedContent(parsed.data.title, parsed.data.description)) {
        return sendError(reply, 422, "CONTENT_REJECTED", CONTENT_REJECTED_MSG);
      }

      const [existing] = await db
        .select()
        .from(themes)
        .where(and(eq(themes.id, tid), eq(themes.universeId, universeId), isNull(themes.deletedAt)))
        .limit(1);

      if (!existing) return sendError(reply, 404, "NOT_FOUND", "Theme not found");

      const [updated] = await db
        .update(themes)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(themes.id, tid))
        .returning();

      return reply.code(200).send(updated);
    },
  );

  /**
   * DELETE /api/v1/universes/:id/themes/:tid
   * Soft-delete a theme.
   */
  app.delete(
    "/universes/:id/themes/:tid",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id: universeId, tid } = request.params as { id: string; tid: string };
      const actor = request.actor;
      const appMode = request.appMode;

      const isPrivileged = actor.role === "ADMIN" || actor.role === "MODERATOR";

      if (!isPrivileged) {
        if (appMode !== "MULTI") return sendError(reply, 403, "FORBIDDEN", "Forbidden");
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
        if (access === false) return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      } else {
        const access = await assertUniverseAccess(universeId, actor.id, actor.role);
        if (access === null) return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      }

      const [existing] = await db
        .select()
        .from(themes)
        .where(and(eq(themes.id, tid), eq(themes.universeId, universeId), isNull(themes.deletedAt)))
        .limit(1);

      if (!existing) return sendError(reply, 404, "NOT_FOUND", "Theme not found");

      await db
        .update(themes)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(themes.id, tid));

      return reply.code(200).send({ ok: true });
    },
  );
}
