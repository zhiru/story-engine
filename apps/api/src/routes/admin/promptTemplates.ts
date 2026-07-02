import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { sendError } from "../../http/errors.js";
import { CreatePromptTemplateInputSchema, UpdatePromptTemplateInputSchema } from "@storygen/shared";
import { db } from "../../db/client.js";
import { promptTemplates, auditLogs, aiProviders } from "../../db/schema.js";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { containsSafetyBlock } from "../../ai/prompt.js";

/**
 * SDD 8.4 camada 1 / RF-42: o editor de prompts NÃO permite remover o bloco
 * fixo de diretrizes de segurança infantil. Criar/editar/ativar um template
 * sem o SAFETY_BLOCK verbatim → 422.
 */
const SAFETY_BLOCK_ERROR =
  "O template deve conter o bloco fixo de diretrizes de segurança infantil " +
  "(SAFETY_BLOCK) verbatim — ele não pode ser removido nem editado.";

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
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      // Guarda do bloco fixo de segurança (SDD 8.4 camada 1)
      if (!containsSafetyBlock(parsed.data.template)) {
        return sendError(reply, 422, "SAFETY_BLOCK_REQUIRED", SAFETY_BLOCK_ERROR);
      }

      // Verify the AI provider exists
      const [provider] = await db
        .select()
        .from(aiProviders)
        .where(and(eq(aiProviders.id, parsed.data.aiProviderId), isNull(aiProviders.deletedAt)))
        .limit(1);

      if (!provider) {
        return sendError(reply, 404, "NOT_FOUND", "AI provider not found");
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
        return sendError(reply, 400, "VALIDATION_ERROR", "Invalid input", parsed.error.flatten());
      }

      const [existing] = await db
        .select()
        .from(promptTemplates)
        .where(and(eq(promptTemplates.id, id), isNull(promptTemplates.deletedAt)))
        .limit(1);

      if (!existing) {
        return sendError(reply, 404, "NOT_FOUND", "Prompt template not found");
      }

      // Guarda do bloco fixo de segurança (SDD 8.4 camada 1): vale para edição
      // do texto e para ativação (o template resultante precisa conter o bloco).
      const effectiveTemplate = parsed.data.template ?? existing.template;
      if (
        (parsed.data.template !== undefined || parsed.data.isActive === true) &&
        !containsSafetyBlock(effectiveTemplate)
      ) {
        return sendError(reply, 422, "SAFETY_BLOCK_REQUIRED", SAFETY_BLOCK_ERROR);
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
