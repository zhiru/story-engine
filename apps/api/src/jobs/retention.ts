/**
 * Retention purge job (SDD 11.1) — exclusão física de dados soft-deletados há mais
 * de RETENTION_DAYS (padrão 180) dias. Run via: pnpm job:retention
 *
 * Base legal (LGPD art. 15/16): terminado o tratamento (conta encerrada + período
 * de retenção decorrido), os dados pessoais devem ser eliminados. A trilha de
 * auditoria é preservada (audit_logs) apenas desvinculando o ator (actor_id NULL),
 * pois deixa de ser dado pessoal identificável e atende ao dever de prestação de contas.
 *
 * A ordem de expurgo respeita as FKs: primeiro as linhas que referenciam o
 * usuário/universo, por último users. Roda em transação única (tudo ou nada).
 */
import { pathToFileURL } from "node:url";
import { lt, and, or, isNotNull, inArray, notInArray } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  users,
  childProfiles,
  universes,
  characters,
  themes,
  storyArcs,
  stories,
  refreshTokens,
  consentRecords,
  subscriptions,
  usageRecords,
  ratings,
  reports,
  notifications,
  collaborations,
  promptTemplates,
  aiProviders,
  plans,
  appSettings,
  auditLogs,
} from "../db/schema.js";

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 180);

export async function runRetention(): Promise<Record<string, number>> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  console.log(`[retention] cutoff=${cutoff.toISOString()} (${RETENTION_DAYS} days)`);

  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    // ── 1. Usuários elegíveis (soft-deletados além do prazo) ──────────────────
    const purgeUsers = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)));
    let userIds = purgeUsers.map((u) => u.id);

    // prompt_templates.created_by é NOT NULL e aponta para users: excluir o autor
    // destruiria configuração do sistema. Usuário assim referenciado é pulado
    // nesta execução (requer revisão manual/reatribuição do template).
    if (userIds.length > 0) {
      const blocked = await tx
        .selectDistinct({ id: promptTemplates.createdBy })
        .from(promptTemplates)
        .where(inArray(promptTemplates.createdBy, userIds));
      const blockedIds = new Set(blocked.map((b) => b.id));
      if (blockedIds.size > 0) {
        console.warn(
          `[retention] ${blockedIds.size} user(s) skipped: referenced by prompt_templates.created_by (manual review needed)`,
        );
        userIds = userIds.filter((id) => !blockedIds.has(id));
      }
    }

    // ── 2. Dependências diretas do titular (FKs para users) ───────────────────
    if (userIds.length > 0) {
      counts.refreshTokens = (
        await tx
          .delete(refreshTokens)
          .where(inArray(refreshTokens.userId, userIds))
          .returning({ id: refreshTokens.id })
      ).length;

      // Consentimentos: só são exigíveis enquanto houver tratamento; com o
      // titular expurgado, mantê-los seria conservar dado pessoal órfão.
      counts.consentRecords = (
        await tx
          .delete(consentRecords)
          .where(inArray(consentRecords.userId, userIds))
          .returning({ id: consentRecords.id })
      ).length;

      counts.notifications = (
        await tx
          .delete(notifications)
          .where(inArray(notifications.userId, userIds))
          .returning({ id: notifications.id })
      ).length;

      counts.ratings = (
        await tx
          .delete(ratings)
          .where(inArray(ratings.userId, userIds))
          .returning({ id: ratings.id })
      ).length;

      // Denúncias DE autoria do titular saem junto; onde ele foi apenas o
      // resolvedor, a denúncia (de terceiro) é preservada e o vínculo anulado.
      await tx
        .update(reports)
        .set({ resolvedBy: null })
        .where(inArray(reports.resolvedBy, userIds));
      counts.reports = (
        await tx
          .delete(reports)
          .where(inArray(reports.reporterId, userIds))
          .returning({ id: reports.id })
      ).length;

      // Billing: mantido apenas pelo mínimo legal fiscal (SDD 11.2 passo 6);
      // RETENTION_DAYS deve ser configurado ≥ a esse mínimo.
      counts.subscriptions = (
        await tx
          .delete(subscriptions)
          .where(inArray(subscriptions.userId, userIds))
          .returning({ id: subscriptions.id })
      ).length;

      counts.usageRecords = (
        await tx
          .delete(usageRecords)
          .where(inArray(usageRecords.userId, userIds))
          .returning({ id: usageRecords.id })
      ).length;

      // Trilha de auditoria preservada (SDD 11.1): apenas desvincula o ator.
      await tx
        .update(auditLogs)
        .set({ actorId: null })
        .where(inArray(auditLogs.actorId, userIds));
    }

    // ── 3. Conteúdo criativo: universos além do prazo + órfãos do titular ─────
    const purgeUniverses = await tx
      .select({ id: universes.id })
      .from(universes)
      .where(and(isNotNull(universes.deletedAt), lt(universes.deletedAt, cutoff)));
    const universeIds = purgeUniverses.map((u) => u.id);

    // Filhos de um universo expurgado seguem o pai (ficaram inacessíveis desde o
    // soft-delete e compartilham o mesmo prazo legal), mesmo sem deleted_at próprio.
    // Personagens e temas/arcos a expurgar (para desarmar FKs antes do DELETE):
    const purgeChars = await tx
      .select({ id: characters.id })
      .from(characters)
      .where(
        or(
          and(isNotNull(characters.deletedAt), lt(characters.deletedAt, cutoff)),
          universeIds.length > 0 ? inArray(characters.universeId, universeIds) : undefined,
        ),
      );
    const charIds = purgeChars.map((c) => c.id);

    const purgeThemes = await tx
      .select({ id: themes.id })
      .from(themes)
      .where(
        or(
          and(isNotNull(themes.deletedAt), lt(themes.deletedAt, cutoff)),
          universeIds.length > 0 ? inArray(themes.universeId, universeIds) : undefined,
        ),
      );
    const themeIds = purgeThemes.map((t) => t.id);

    const purgeArcs = await tx
      .select({ id: storyArcs.id })
      .from(storyArcs)
      .where(
        or(
          and(isNotNull(storyArcs.deletedAt), lt(storyArcs.deletedAt, cutoff)),
          universeIds.length > 0 ? inArray(storyArcs.universeId, universeIds) : undefined,
        ),
      );
    const arcIds = purgeArcs.map((a) => a.id);

    // collaborations (Fase 3) referenciam universos e personagens: saem antes.
    const collabConds = [
      and(isNotNull(collaborations.deletedAt), lt(collaborations.deletedAt, cutoff)),
    ];
    if (universeIds.length > 0) {
      collabConds.push(inArray(collaborations.originUniverseId, universeIds));
      collabConds.push(inArray(collaborations.targetUniverseId, universeIds));
    }
    if (charIds.length > 0) {
      collabConds.push(inArray(collaborations.characterId, charIds));
    }
    counts.collaborations = (
      await tx
        .delete(collaborations)
        .where(or(...collabConds))
        .returning({ id: collaborations.id })
    ).length;

    // Histórias: soft-deletadas além do prazo, dentro de universo expurgado, OU
    // geradas por titular expurgado (stories.user_id é NOT NULL — a linha não
    // pode sobreviver ao usuário; o conteúdo já foi anonimizado na erasure).
    const storyConds = [
      and(isNotNull(stories.deletedAt), lt(stories.deletedAt, cutoff)),
    ];
    if (universeIds.length > 0) storyConds.push(inArray(stories.universeId, universeIds));
    if (userIds.length > 0) storyConds.push(inArray(stories.userId, userIds));
    counts.stories = (
      await tx
        .delete(stories)
        .where(or(...storyConds))
        .returning({ id: stories.id })
    ).length;

    // Histórias remanescentes que referenciam tema/arco expurgado: o vínculo é
    // opcional (FK nullable) e o snapshot da história preserva o conteúdo.
    if (themeIds.length > 0) {
      await tx
        .update(stories)
        .set({ themeId: null })
        .where(inArray(stories.themeId, themeIds));
    }
    if (arcIds.length > 0) {
      await tx
        .update(stories)
        .set({ storyArcId: null })
        .where(inArray(stories.storyArcId, arcIds));
    }

    if (charIds.length > 0) {
      counts.characters = (
        await tx
          .delete(characters)
          .where(inArray(characters.id, charIds))
          .returning({ id: characters.id })
      ).length;
    } else {
      counts.characters = 0;
    }

    counts.themes =
      themeIds.length > 0
        ? (
            await tx
              .delete(themes)
              .where(inArray(themes.id, themeIds))
              .returning({ id: themes.id })
          ).length
        : 0;

    counts.storyArcs =
      arcIds.length > 0
        ? (
            await tx
              .delete(storyArcs)
              .where(inArray(storyArcs.id, arcIds))
              .returning({ id: storyArcs.id })
          ).length
        : 0;

    if (universeIds.length > 0) {
      // Avaliações de terceiros sobre universo expurgado perdem o objeto avaliado.
      await tx.delete(ratings).where(inArray(ratings.universeId, universeIds));
      // app_settings.single_mode_universe_id é FK nullable: desvincula.
      await tx
        .update(appSettings)
        .set({ singleModeUniverseId: null })
        .where(inArray(appSettings.singleModeUniverseId, universeIds));
      counts.universes = (
        await tx
          .delete(universes)
          .where(inArray(universes.id, universeIds))
          .returning({ id: universes.id })
      ).length;
    } else {
      counts.universes = 0;
    }

    // ── 4. Perfis infantis e usuários ─────────────────────────────────────────
    // Perfis do titular expurgado (soft-deletados na erasure) + soft-deletados avulsos.
    const childConds = [
      and(isNotNull(childProfiles.deletedAt), lt(childProfiles.deletedAt, cutoff)),
    ];
    if (userIds.length > 0) childConds.push(inArray(childProfiles.guardianId, userIds));
    counts.childProfiles = (
      await tx
        .delete(childProfiles)
        .where(or(...childConds))
        .returning({ id: childProfiles.id })
    ).length;

    counts.users =
      userIds.length > 0
        ? (
            await tx
              .delete(users)
              .where(inArray(users.id, userIds))
              .returning({ id: users.id })
          ).length
        : 0;

    // ── 5. Tabelas antes ignoradas pelo job: soft-deletadas além do prazo ─────
    // prompt_templates: stories.prompt_template_id não tem FK (snapshot), seguro excluir.
    counts.promptTemplates = (
      await tx
        .delete(promptTemplates)
        .where(and(isNotNull(promptTemplates.deletedAt), lt(promptTemplates.deletedAt, cutoff)))
        .returning({ id: promptTemplates.id })
    ).length;

    // subscriptions soft-deletadas avulsas (canceladas há muito tempo).
    counts.subscriptionsSoftDeleted = (
      await tx
        .delete(subscriptions)
        .where(and(isNotNull(subscriptions.deletedAt), lt(subscriptions.deletedAt, cutoff)))
        .returning({ id: subscriptions.id })
    ).length;

    // ai_providers/plans: só se nenhuma linha remanescente os referencia (FK NOT NULL).
    const referencedProviders = await tx
      .selectDistinct({ id: promptTemplates.aiProviderId })
      .from(promptTemplates);
    const refProviderIds = referencedProviders.map((r) => r.id);
    counts.aiProviders = (
      await tx
        .delete(aiProviders)
        .where(
          and(
            isNotNull(aiProviders.deletedAt),
            lt(aiProviders.deletedAt, cutoff),
            refProviderIds.length > 0
              ? notInArray(aiProviders.id, refProviderIds)
              : undefined,
          ),
        )
        .returning({ id: aiProviders.id })
    ).length;

    const referencedPlans = await tx
      .selectDistinct({ id: subscriptions.planId })
      .from(subscriptions);
    const refPlanIds = referencedPlans.map((r) => r.id);
    counts.plans = (
      await tx
        .delete(plans)
        .where(
          and(
            isNotNull(plans.deletedAt),
            lt(plans.deletedAt, cutoff),
            refPlanIds.length > 0
              ? notInArray(plans.id, refPlanIds)
              : undefined,
          ),
        )
        .returning({ id: plans.id })
    ).length;

    // ── 6. Registro do expurgo em audit_logs (SDD 11.1) ───────────────────────
    await tx.insert(auditLogs).values({
      actorId: null,
      action: "RETENTION_PURGE",
      targetType: "SYSTEM",
      targetId: null,
      metadata: { cutoff: cutoff.toISOString(), retentionDays: RETENTION_DAYS, counts },
    });
  });

  console.log("[retention] purged:", counts);
  return counts;
}

// Executa apenas quando invocado como script (pnpm job:retention);
// em testes o módulo é importado e runRetention() chamada diretamente.
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  runRetention()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[retention] FATAL:", err);
      process.exit(1);
    });
}
