/**
 * GET /api/v1/admin/cost
 * Generation cost summary: total stories this month, token usage by provider.
 * ADMIN only.
 */
import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { db } from "../../db/client.js";
import { stories, usageRecords } from "../../db/schema.js";
import { sql, and, gte, lt, isNotNull } from "drizzle-orm";

export async function adminCostRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/admin/cost",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (_request, reply) => {
      // Current month boundaries
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      // Total stories generated this month (by createdAt)
      const [totalRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(stories)
        .where(
          and(
            gte(stories.createdAt, monthStart),
            lt(stories.createdAt, monthEnd),
          ),
        );
      const totalStories = totalRow?.count ?? 0;

      // Aggregate token usage from generationCost jsonb by provider
      // generationCost shape (SDD 8.5, snake_case):
      // { input_tokens, output_tokens, provider, model }
      const providerRows = await db
        .select({
          provider: sql<string>`(generation_cost->>'provider')`,
          inputTokens: sql<number>`sum((generation_cost->>'input_tokens')::numeric)::bigint`,
          outputTokens: sql<number>`sum((generation_cost->>'output_tokens')::numeric)::bigint`,
          count: sql<number>`count(*)::int`,
        })
        .from(stories)
        .where(
          and(
            isNotNull(stories.generationCost),
            gte(stories.createdAt, monthStart),
            lt(stories.createdAt, monthEnd),
          ),
        )
        .groupBy(sql`generation_cost->>'provider'`);

      // Usage records this month (story count from usage_records table)
      const [usageRow] = await db
        .select({ total: sql<number>`sum(quantity)::int` })
        .from(usageRecords)
        .where(
          and(
            sql`metric = 'STORY_GENERATED'`,
            sql`period = ${period}`,
          ),
        );
      const usageTotal = usageRow?.total ?? 0;

      return reply.code(200).send({
        period,
        totalStoriesGenerated: totalStories,
        usageRecordsTotal: usageTotal,
        byProvider: providerRows.map((r) => ({
          provider: r.provider ?? "unknown",
          count: r.count,
          inputTokens: Number(r.inputTokens ?? 0),
          outputTokens: Number(r.outputTokens ?? 0),
        })),
      });
    },
  );
}
