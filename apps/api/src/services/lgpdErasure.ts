/**
 * LGPD Erasure Service (SDD 11.2)
 * Implements right-to-erasure (Art. 18 LGPD / GDPR Art. 17).
 * Runs in a transaction: anonymizes PII, soft-deletes dependent entities,
 * purges content references, writes audit log.
 */
import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  users,
  childProfiles,
  refreshTokens,
  universes,
  characters,
  themes,
  storyArcs,
  stories,
  auditLogs,
} from "../db/schema.js";

const SALT = process.env.LGPD_HASH_SALT ?? "storygen-dev-salt";

/** Conteúdo de história PRIVATE excluída integralmente a pedido (SDD 11.2 passo 3). */
export const PRIVATE_STORY_REMOVED_CONTENT = "[REMOVIDO A PEDIDO DO TITULAR]";

function hashEmail(email: string): string {
  const hash = createHash("sha256").update(email + SALT).digest("hex");
  return `deleted+${hash.slice(0, 16)}@anon.invalid`;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value + SALT).digest("hex").slice(0, 8).toUpperCase();
}

/** Tag de anonimização no formato do SDD 11.2: [ANONIMIZADO_<hash>]. */
function anonTag(value: string): string {
  return `[ANONIMIZADO_${shortHash(value)}]`;
}

export interface ErasureOptions {
  /** true → histórias PRIVATE do titular são excluídas integralmente (SDD 11.2 passo 3). */
  deletePrivateStories?: boolean;
}

export interface ErasureResult {
  ok: true;
  anonymized: {
    childProfiles: number;
    refreshTokens: number;
    characters: number;
    stories: number;
    universes: number;
    themes: number;
    storyArcs: number;
    privateStoriesDeleted: number;
  };
}

export async function eraseUser(
  userId: string,
  options: ErasureOptions = {},
): Promise<ErasureResult> {
  const deletePrivateStories = options.deletePrivateStories ?? false;

  return await db.transaction(async (tx) => {
    // 1. Fetch the user
    const [user] = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) throw new Error(`User not found: ${userId}`);

    const anonEmail = hashEmail(user.email);

    // 2. Soft-delete + anonymize user
    await tx
      .update(users)
      .set({
        deletedAt: new Date(),
        email: anonEmail,
        name: "[ANON]",
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // 3. Soft-delete child profiles
    const childRows = await tx
      .update(childProfiles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(childProfiles.guardianId, userId))
      .returning({ id: childProfiles.id });
    const childCount = childRows.length;

    // 4. Revoke all refresh tokens
    const tokenRows = await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.userId, userId))
      .returning({ id: refreshTokens.id });
    const tokenCount = tokenRows.length;

    // 5. Anonymize + soft-delete characters in universes owned by this user.
    //    Guarda o mapa nome→tag para usar o MESMO hash por personagem no
    //    conteúdo das histórias (SDD 11.2 passos 2-3).
    const userUniverses = await tx
      .select({ id: universes.id })
      .from(universes)
      .where(eq(universes.userId, userId));
    const universeIds = userUniverses.map((u) => u.id);
    const ownedUniverseSet = new Set(universeIds);

    let charCount = 0;
    const nameToTag = new Map<string, string>();
    if (universeIds.length > 0) {
      const charRows = await tx
        .select({ id: characters.id, name: characters.name })
        .from(characters)
        .where(inArray(characters.universeId, universeIds));

      charCount = charRows.length;

      for (const char of charRows) {
        const tag = anonTag(char.id);
        nameToTag.set(char.name.toLowerCase(), tag);
        await tx
          .update(characters)
          .set({
            name: tag,
            traits: [tag],
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(characters.id, char.id));
      }
    }

    // 5b. Soft-delete das entidades dependentes do titular (SDD 11.2 passo 1):
    //     universos próprios, temas e arcos — o job de retenção fará a exclusão
    //     física após o prazo legal.
    let themeCount = 0;
    let arcCount = 0;
    if (universeIds.length > 0) {
      themeCount = (
        await tx
          .update(themes)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(inArray(themes.universeId, universeIds))
          .returning({ id: themes.id })
      ).length;

      arcCount = (
        await tx
          .update(storyArcs)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(inArray(storyArcs.universeId, universeIds))
          .returning({ id: storyArcs.id })
      ).length;
    }

    const universeRows =
      universeIds.length > 0
        ? await tx
            .update(universes)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(inArray(universes.id, universeIds))
            .returning({ id: universes.id })
        : [];
    const universeCount = universeRows.length;

    // 6. Anonymize story content and purge PII fields.
    //    Histórias geradas em universos de terceiros ficam apenas anonimizadas;
    //    as geradas nos universos do próprio titular são também soft-deletadas.
    const storyRows = await tx
      .select({
        id: stories.id,
        universeId: stories.universeId,
        visibility: stories.visibility,
        content: stories.content,
        characterNames: stories.characterNames,
      })
      .from(stories)
      .where(eq(stories.userId, userId));

    const storyCount = storyRows.length;
    let privateDeletedCount = 0;

    for (const story of storyRows) {
      let content = story.content;
      const names: string[] = (story.characterNames as string[]) ?? [];

      // Replace each character name with its per-character tag in content.
      // Nome sem personagem correspondente (ex.: universo de terceiro) recebe
      // tag determinística derivada do próprio nome.
      for (const name of names) {
        if (name.trim()) {
          const tag = nameToTag.get(name.toLowerCase()) ?? anonTag(name);
          // Escape regex special chars
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          content = content.replace(new RegExp(escaped, "gi"), tag);
        }
      }

      const isOwnUniverse = ownedUniverseSet.has(story.universeId);
      const purgePrivate = deletePrivateStories && story.visibility === "PRIVATE";
      if (purgePrivate) {
        // SDD 11.2 passo 3 (última frase): PRIVATE excluída integralmente a pedido.
        content = PRIVATE_STORY_REMOVED_CONTENT;
        privateDeletedCount += 1;
      }

      await tx
        .update(stories)
        .set({
          content,
          promptUsed: "",
          userGuidance: null,
          ...(isOwnUniverse || purgePrivate ? { deletedAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(stories.id, story.id));
    }

    // 7. Write audit log
    await tx.insert(auditLogs).values({
      actorId: userId,
      action: "LGPD_ERASURE",
      targetType: "USER",
      targetId: userId,
      metadata: {
        deletePrivateStories,
        counts: {
          childProfiles: childCount,
          refreshTokens: tokenCount,
          characters: charCount,
          stories: storyCount,
          universes: universeCount,
          themes: themeCount,
          storyArcs: arcCount,
          privateStoriesDeleted: privateDeletedCount,
        },
      },
    });

    return {
      ok: true,
      anonymized: {
        childProfiles: childCount,
        refreshTokens: tokenCount,
        characters: charCount,
        stories: storyCount,
        universes: universeCount,
        themes: themeCount,
        storyArcs: arcCount,
        privateStoriesDeleted: privateDeletedCount,
      },
    } satisfies ErasureResult;
  });
}
