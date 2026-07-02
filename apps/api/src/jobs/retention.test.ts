/**
 * Testes do job de retenção (SDD 11.1): usuário apagado (erasure) há mais de
 * RETENTION_DAYS com linhas em TODAS as tabelas que o referenciam deve ser
 * expurgado fisicamente sem violar FKs; a trilha de auditoria é preservada
 * com actor_id NULL e o expurgo é registrado (RETENTION_PURGE).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { resetDb, seedUser } from "../test/db.js";
import {
  users,
  childProfiles,
  refreshTokens,
  consentRecords,
  plans,
  subscriptions,
  usageRecords,
  universes,
  characters,
  themes,
  storyArcs,
  stories,
  ratings,
  reports,
  notifications,
  auditLogs,
} from "../db/schema.js";
import { runRetention } from "./retention.js";

const OLD = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000); // > RETENTION_DAYS (180)
const RECENT = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

beforeEach(async () => {
  await resetDb();
});

describe("retention job (purge order / FK safety)", () => {
  it("purges an erased user with rows in every referencing table without FK violations", async () => {
    // ── titular apagado há 200 dias ──────────────────────────────────────────
    const erased = await seedUser({ email: "erased@test.com", role: "USER" });
    await db.update(users).set({ deletedAt: OLD }).where(eq(users.id, erased.id));

    // ── usuário vivo (denunciante / dono de universo alheio) ─────────────────
    const live = await seedUser({ email: "live@test.com", role: "USER" });

    // Tabelas que referenciam users:
    await db.insert(refreshTokens).values({
      userId: erased.id,
      tokenHash: "hash",
      expiresAt: new Date(Date.now() + 1000 * 60),
    });
    await db.insert(consentRecords).values({
      userId: erased.id,
      consentType: "PARENTAL_DATA",
      policyVersion: "1.0",
      granted: true,
    });
    await db.insert(childProfiles).values({
      guardianId: erased.id,
      nickname: "kid",
      ageBand: "4_6",
      deletedAt: OLD,
    });
    const [plan] = await db
      .insert(plans)
      .values({ name: "P", maxUniverses: 1, maxStoriesPerMonth: 1, priceCents: 0 })
      .returning();
    await db.insert(subscriptions).values({
      userId: erased.id,
      planId: plan!.id,
      status: "CANCELED",
      store: "STRIPE",
      currentPeriodEnd: new Date(),
    });
    await db.insert(usageRecords).values({
      userId: erased.id,
      metric: "STORY_GENERATED",
      period: "2025-01",
      quantity: 1,
    });
    await db.insert(notifications).values({
      userId: erased.id,
      type: "MODERATION_ACTION",
      payload: {},
    });

    // Conteúdo criativo do titular (soft-deletado na erasure, além do prazo)
    const [ownUniverse] = await db
      .insert(universes)
      .values({ userId: erased.id, title: "U", description: "d", deletedAt: OLD })
      .returning();
    const [ownChar] = await db
      .insert(characters)
      .values({
        universeId: ownUniverse!.id,
        name: "[ANONIMIZADO_X]",
        classification: "PRINCIPAL",
        deletedAt: OLD,
      })
      .returning();
    const [ownTheme] = await db
      .insert(themes)
      .values({ universeId: ownUniverse!.id, title: "T", deletedAt: OLD })
      .returning();
    const [ownArc] = await db
      .insert(storyArcs)
      .values({ universeId: ownUniverse!.id, title: "A", deletedAt: OLD })
      .returning();
    const [ownStory] = await db
      .insert(stories)
      .values({
        universeId: ownUniverse!.id,
        userId: erased.id,
        themeId: ownTheme!.id,
        storyArcId: ownArc!.id,
        title: "S",
        content: "c",
        promptUsed: "",
        deletedAt: OLD,
      })
      .returning();

    // História do titular em universo de TERCEIRO (não soft-deletada — só anonimizada)
    const [liveUniverse] = await db
      .insert(universes)
      .values({ userId: live.id, title: "LU", description: "d" })
      .returning();
    const [foreignStory] = await db
      .insert(stories)
      .values({
        universeId: liveUniverse!.id,
        userId: erased.id,
        title: "FS",
        content: "[ANONIMIZADO_Y] anon",
        promptUsed: "",
      })
      .returning();

    // Rating do titular no universo do terceiro + rating do terceiro no universo expurgado
    await db.insert(ratings).values({ universeId: liveUniverse!.id, userId: erased.id, score: 4 });
    await db.insert(ratings).values({ universeId: ownUniverse!.id, userId: live.id, score: 5 });

    // Report DE autoria do titular + report do terceiro RESOLVIDO pelo titular
    await db.insert(reports).values({
      reporterId: erased.id,
      targetType: "STORY",
      targetId: foreignStory!.id,
      reason: "spam",
    });
    const [resolvedReport] = await db
      .insert(reports)
      .values({
        reporterId: live.id,
        targetType: "UNIVERSE",
        targetId: ownUniverse!.id,
        reason: "other",
        status: "ACTIONED",
        resolvedBy: erased.id,
      })
      .returning();

    // Trilha de auditoria com o titular como ator (deve sobreviver com actor NULL)
    const [erasureLog] = await db
      .insert(auditLogs)
      .values({
        actorId: erased.id,
        action: "LGPD_ERASURE",
        targetType: "USER",
        targetId: erased.id,
      })
      .returning();

    // ── roda o job — não pode lançar (bug antigo: violação de FK) ────────────
    const counts = await runRetention();

    // Usuário fisicamente removido
    const remainingUsers = await db.select().from(users).where(eq(users.id, erased.id));
    expect(remainingUsers).toHaveLength(0);
    expect(counts.users).toBe(1);

    // Conteúdo criativo removido (inclusive a história em universo alheio — FK NOT NULL)
    expect(await db.select().from(universes).where(eq(universes.id, ownUniverse!.id))).toHaveLength(0);
    expect(await db.select().from(characters).where(eq(characters.id, ownChar!.id))).toHaveLength(0);
    expect(await db.select().from(themes).where(eq(themes.id, ownTheme!.id))).toHaveLength(0);
    expect(await db.select().from(storyArcs).where(eq(storyArcs.id, ownArc!.id))).toHaveLength(0);
    expect(await db.select().from(stories).where(eq(stories.id, ownStory!.id))).toHaveLength(0);
    expect(await db.select().from(stories).where(eq(stories.id, foreignStory!.id))).toHaveLength(0);

    // Dependências do titular removidas
    expect(await db.select().from(refreshTokens).where(eq(refreshTokens.userId, erased.id))).toHaveLength(0);
    expect(await db.select().from(consentRecords).where(eq(consentRecords.userId, erased.id))).toHaveLength(0);
    expect(await db.select().from(childProfiles).where(eq(childProfiles.guardianId, erased.id))).toHaveLength(0);
    expect(await db.select().from(subscriptions).where(eq(subscriptions.userId, erased.id))).toHaveLength(0);
    expect(await db.select().from(usageRecords).where(eq(usageRecords.userId, erased.id))).toHaveLength(0);
    expect(await db.select().from(notifications).where(eq(notifications.userId, erased.id))).toHaveLength(0);
    expect(await db.select().from(ratings)).toHaveLength(0); // ambas: do titular e sobre o universo expurgado

    // Report do titular removido; report do terceiro preservado com resolved_by NULL
    expect(await db.select().from(reports).where(eq(reports.reporterId, erased.id))).toHaveLength(0);
    const [keptReport] = await db.select().from(reports).where(eq(reports.id, resolvedReport!.id));
    expect(keptReport).toBeDefined();
    expect(keptReport?.resolvedBy).toBeNull();

    // Trilha de auditoria preservada com ator desvinculado
    const [keptLog] = await db.select().from(auditLogs).where(eq(auditLogs.id, erasureLog!.id));
    expect(keptLog).toBeDefined();
    expect(keptLog?.actorId).toBeNull();

    // Registro RETENTION_PURGE gravado
    const purgeLogs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "RETENTION_PURGE"));
    expect(purgeLogs).toHaveLength(1);

    // Usuário vivo e seu universo intactos
    expect(await db.select().from(users).where(eq(users.id, live.id))).toHaveLength(1);
    expect(await db.select().from(universes).where(eq(universes.id, liveUniverse!.id))).toHaveLength(1);
  });

  it("does not purge users/content deleted more recently than the retention window", async () => {
    const recent = await seedUser({ email: "recent@test.com", role: "USER" });
    await db.update(users).set({ deletedAt: RECENT }).where(eq(users.id, recent.id));
    const [uni] = await db
      .insert(universes)
      .values({ userId: recent.id, title: "R", description: "d", deletedAt: RECENT })
      .returning();

    await runRetention();

    expect(await db.select().from(users).where(eq(users.id, recent.id))).toHaveLength(1);
    expect(await db.select().from(universes).where(eq(universes.id, uni!.id))).toHaveLength(1);
  });

  it("nulls theme/arc links of surviving stories when the theme/arc is purged", async () => {
    const owner = await seedUser({ email: "keeper@test.com", role: "USER" });
    const [uni] = await db
      .insert(universes)
      .values({ userId: owner.id, title: "U", description: "d" })
      .returning();
    // Tema soft-deletado há muito tempo, mas história VIVA ainda o referencia
    const [oldTheme] = await db
      .insert(themes)
      .values({ universeId: uni!.id, title: "velho", deletedAt: OLD })
      .returning();
    const [liveStory] = await db
      .insert(stories)
      .values({
        universeId: uni!.id,
        userId: owner.id,
        themeId: oldTheme!.id,
        title: "viva",
        content: "c",
        promptUsed: "p",
      })
      .returning();

    await runRetention();

    expect(await db.select().from(themes).where(eq(themes.id, oldTheme!.id))).toHaveLength(0);
    const [kept] = await db.select().from(stories).where(eq(stories.id, liveStory!.id));
    expect(kept).toBeDefined();
    expect(kept?.themeId).toBeNull();
  });
});
