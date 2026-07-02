import type { FastifyInstance } from "fastify";
import { UpdateStoryVisibilityInputSchema } from "@storygen/shared";
import { requireAuth } from "../auth/middleware.js";
import {
  listApproved,
  getReadable,
  listReadable,
  getStoryById,
  setStoryVisibility,
} from "../repos/stories.js";
import { getUniverseById, canReadUniverse } from "../repos/universes.js";
import { sendError } from "../http/errors.js";
import { decodeCursor, paginateRows, parseLimit } from "../http/pagination.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function storyRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/universes/:id/stories
   * Lists APPROVED stories for a universe.
   * Acesso ao universo primeiro (SDD §6.4): dono, admin/mod, PUBLIC,
   * ou o universo do modo SINGLE do app; caso contrário 403.
   */
  app.get(
    "/universes/:id/stories",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const universe = await getUniverseById(id);
      if (!universe) {
        return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      }
      if (!canReadUniverse(request.actor, universe, request.singleModeUniverseId)) {
        return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      }

      const list = await listApproved(id);
      return reply.code(200).send(
        list.map((s) => ({
          id: s.id,
          title: s.title,
          createdAt: s.createdAt.toISOString(),
        })),
      );
    },
  );

  /**
   * GET /api/v1/stories?universe_id=&story_arc_id=&cursor=&limit=
   * Listagem top-level (SDD §7.1 — filtros: universe, arc), paginada por
   * cursor, mais recentes primeiro. O requisitante lê: histórias geradas por
   * ele, em universos de que é dono, ou PUBLIC+APPROVED; admin/mod veem tudo.
   * Com universe_id também aplica canReadUniverse (SDD §6.4).
   */
  app.get("/stories", { preHandler: [requireAuth] }, async (request, reply) => {
    const query = request.query as {
      universe_id?: string;
      story_arc_id?: string;
      cursor?: string;
      limit?: string;
    };

    if (query.universe_id && !UUID_RE.test(query.universe_id)) {
      return sendError(reply, 400, "VALIDATION_ERROR", "Invalid universe_id");
    }
    if (query.story_arc_id && !UUID_RE.test(query.story_arc_id)) {
      return sendError(reply, 400, "VALIDATION_ERROR", "Invalid story_arc_id");
    }

    const limit = parseLimit(query.limit);
    const cursor = decodeCursor(query.cursor, {
      created_at: "date",
      id: "uuid",
    });

    if (query.universe_id) {
      const universe = await getUniverseById(query.universe_id);
      if (!universe) {
        return sendError(reply, 404, "NOT_FOUND", "Universe not found");
      }
      if (
        !canReadUniverse(request.actor, universe, request.singleModeUniverseId)
      ) {
        return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      }
    }

    const rows = await listReadable(
      request.actor,
      {
        ...(query.universe_id && { universeId: query.universe_id }),
        ...(query.story_arc_id && { storyArcId: query.story_arc_id }),
      },
      cursor,
      limit,
    );

    const { items, nextCursor } = paginateRows(rows, limit, (row) => ({
      created_at: row.createdAt.toISOString(),
      id: row.id,
    }));

    return reply.code(200).send({
      items: items.map((s) => ({
        id: s.id,
        universe_id: s.universeId,
        story_arc_id: s.storyArcId,
        title: s.title,
        visibility: s.visibility,
        moderation_status: s.moderationStatus,
        created_at: s.createdAt.toISOString(),
      })),
      next_cursor: nextCursor,
    });
  });

  /**
   * PATCH /api/v1/stories/:id — alterar visibilidade (SDD §6.4/§7.1).
   * Apenas o GERADOR (stories.user_id) pode alterar — nem o dono do universo
   * nem admin/mod (escrita de visibilidade é do gerador; moderador altera
   * moderation_status por outra via). Tornar PUBLIC exige
   * moderation_status='APPROVED' → senão 422 CONTENT_NOT_APPROVED
   * (código escolhido em vez de VALIDATION_ERROR por ser estado de
   * moderação, não erro de formato; espelha o estilo de CONTENT_REJECTED).
   */
  app.patch(
    "/stories/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const parsed = UpdateStoryVisibilityInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(
          reply,
          400,
          "VALIDATION_ERROR",
          "Invalid input",
          parsed.error.flatten(),
        );
      }

      const story = await getStoryById(id);
      if (!story) {
        return sendError(reply, 404, "NOT_FOUND", "Story not found");
      }
      if (story.userId !== request.actor.id) {
        return sendError(reply, 403, "FORBIDDEN", "Forbidden");
      }
      if (
        parsed.data.visibility === "PUBLIC" &&
        story.moderationStatus !== "APPROVED"
      ) {
        return sendError(
          reply,
          422,
          "CONTENT_NOT_APPROVED",
          "Story must be APPROVED before being made PUBLIC",
        );
      }

      const updated = await setStoryVisibility(id, parsed.data.visibility);
      if (!updated) {
        return sendError(reply, 404, "NOT_FOUND", "Story not found");
      }

      return reply.code(200).send({
        id: updated.id,
        visibility: updated.visibility,
        moderation_status: updated.moderationStatus,
      });
    },
  );

  /**
   * GET /api/v1/stories/:id
   * Returns a single story (APPROVED, or owner/admin for PENDING).
   */
  app.get(
    "/stories/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const story = await getReadable(request.actor, id);
      if (!story) {
        return sendError(reply, 404, "NOT_FOUND", "Not found");
      }
      return reply.code(200).send({
        id: story.id,
        universeId: story.universeId,
        title: story.title,
        content: story.content,
        moderationStatus: story.moderationStatus,
        createdAt: story.createdAt.toISOString(),
      });
    },
  );
}
