/**
 * GET /api/v1/discovery — feed de descoberta (SDD RF-30, §7.1).
 * Universos PUBLIC (deleted_at IS NULL), ordenáveis por recência (default)
 * ou avaliação (?sort=top), paginados por cursor → { items, next_cursor }.
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { sendError } from "../http/errors.js";
import {
  decodeCursor,
  paginateRows,
  parseLimit,
  type CursorPayload,
} from "../http/pagination.js";
import {
  listPublicUniverses,
  type DiscoverySort,
} from "../repos/discovery.js";

export async function discoveryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/discovery",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const query = request.query as {
        sort?: string;
        cursor?: string;
        limit?: string;
      };

      const sort: DiscoverySort = query.sort === "top" ? "top" : "recent";
      if (query.sort && query.sort !== "recent" && query.sort !== "top") {
        return sendError(
          reply,
          400,
          "VALIDATION_ERROR",
          "sort must be 'recent' or 'top'",
        );
      }

      const limit = parseLimit(query.limit);
      const cursor = decodeCursor(
        query.cursor,
        sort === "top"
          ? { rating_score: "numeric", id: "uuid" }
          : { created_at: "date", id: "uuid" },
      );

      const rows = await listPublicUniverses(sort, cursor, limit);
      const { items, nextCursor } = paginateRows(
        rows,
        limit,
        (row): CursorPayload =>
          sort === "top"
            ? { rating_score: row.ratingScore, id: row.id }
            : { created_at: row.createdAt.toISOString(), id: row.id },
      );

      return reply.code(200).send({
        items: items.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          rating_score: Number(row.ratingScore),
          created_at: row.createdAt.toISOString(),
          owner_name: row.ownerName,
        })),
        next_cursor: nextCursor,
      });
    },
  );
}
