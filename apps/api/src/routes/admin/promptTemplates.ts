import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { CreatePromptTemplateInputSchema, UpdatePromptTemplateInputSchema } from "@storygen/shared";
import { db } from "../../db/client.js";
import { promptTemplates, auditLogs, aiProviders } from "../../db/schema.js";
import { and, asc, eq, isNull, ne } from "drizzle-orm";

export async function adminPromptTemplateRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/admin/prompt-templates
   * List all prompt templates (including inactive), ordered by createdAt.
   */
  app.get(
    "/admin/prompt-templates",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (_request, reply) => {
      const rows = await db
        .select()
        .from(promptTemplates)
        .where(isNull(promptTemplates.deletedAt))
        .orderBy(asc(promptTemplates.createdAt));

      return reply.code(200).send(rows);
    },
  );

  /**
   * POST /api/v1/admin/prompt-templates
   * Create a new version of a prompt template for a given ai_provider.
   * New template starts as inactive (isActive=false).
   */
  app.post(
    "/admin/prompt-templates",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const actor = request.actor;

      const parsed = CreatePromptTemplateInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      // Verify the AI provider exists
      const [provider] = await db
        .select()
        .from(aiProviders)
        .where(and(eq(aiProviders.id, parsed.data.aiProviderId), isNull(aiProviders.deletedAt)))
        .limit(1);

      if (!provider) {
        return reply.code(404).send({ error: "AI provider not found" });
      }

      // Determine next version number for this provider
      const existing = await db
        .select({ version: promptTemplates.version })
        .from(promptTemplates)
        .where(
          and(
            eq(promptTemplates.aiProviderId, parsed.data.aiProviderId),
            isNull(promptTemplates.deletedAt),
          ),
        )
        .orderBy(asc(promptTemplates.version));

      const maxVersion = existing.length > 0
        ? Math.max(...existing.map((r) => r.version))
        : 0;

      const [template] = await db
        .insert(promptTemplates)
        .values({
          aiProviderId: parsed.data.aiProviderId,
          name: parsed.data.name,
          version: maxVersion + 1,
          template: parsed.data.template,
          variables: parsed.data.variables ?? [],
          isActive: false,
          createdBy: actor.id,
        })
        .returning();

      await db.insert(auditLogs).values({
        actorId: actor.id,
        action: "PROMPT_TEMPLATE_CREATED",
        targetType: "PROMPT_TEMPLATE",
        targetId: template!.id,
        metadata: {
          name: parsed.data.name,
          aiProviderId: parsed.data.aiProviderId,
          version: maxVersion + 1,
        },
      });

      return reply.code(201).send(template);
    },
  );

  /**
   * PATCH /api/v1/admin/prompt-templates/:id
   * Edit text/variables or set isActive=true (deactivates siblings for same provider = rollback/activate).
   */
  app.patch(
    "/admin/prompt-templates/:id",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const actor = request.actor;
      const { id } = request.params as { id: string };

      const parsed = UpdatePromptTemplateInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const [existing] = await db
        .select()
        .from(promptTemplates)
        .where(and(eq(promptTemplates.id, id), isNull(promptTemplates.deletedAt)))
        .limit(1);

      if (!existing) {
        return reply.code(404).send({ error: "Prompt template not found" });
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
      if (parsed.data.template !== undefined) updateData.template = parsed.data.template;
      if (parsed.data.variables !== undefined) updateData.variables = parsed.data.variables;

      let auditAction = "PROMPT_TEMPLATE_UPDATED";

      if (parsed.data.isActive === true) {
        // Deactivate all other templates for the same provider
        await db
          .update(promptTemplates)
          .set({ isActive: false, updatedAt: new Date() })
          .where(
            and(
              eq(promptTemplates.aiProviderId, existing.aiProviderId),
              ne(promptTemplates.id, id),
              isNull(promptTemplates.deletedAt),
            ),
          );
        updateData.isActive = true;
        auditAction = "PROMPT_TEMPLATE_ACTIVATED";
      } else if (parsed.data.isActive === false) {
        updateData.isActive = false;
      }

      const [updated] = await db
        .update(promptTemplates)
        .set(updateData)
        .where(eq(promptTemplates.id, id))
        .returning();

      await db.insert(auditLogs).values({
        actorId: actor.id,
        action: auditAction,
        targetType: "PROMPT_TEMPLATE",
        targetId: id,
        metadata: { changes: parsed.data },
      });

      return reply.code(200).send(updated);
    },
  );
}
