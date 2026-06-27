/**
 * LGPD Erasure Service
 * Implements right-to-erasure (Art. 18 LGPD / GDPR Art. 17).
 * Runs in a transaction: anonymizes PII, purges content references, writes audit log.
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
  stories,
  auditLogs,
} from "../db/schema.js";

const SALT = process.env.LGPD_HASH_SALT ?? "storygen-dev-salt";

function hashEmail(email: string): string {
  const hash = createHash("sha256").update(email + SALT).digest("hex");
  return `deleted+${hash.slice(0, 16)}@anon.invalid`;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value + SALT).digest("hex").slice(0, 8).toUpperCase();
}

export interface ErasureResult {
  ok: true;
  anonymized: {
    childProfiles: number;
    refreshTokens: number;
    characters: number;
    stories: number;
  };
}

export async function eraseUser(userId: string): Promise<ErasureResult> {
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

    // 5. Anonymize characters in universes owned by this user
    const userUniverses = await tx
      .select({ id: universes.id })
      .from(universes)
      .where(eq(universes.userId, userId));

    let charCount = 0;
    if (userUniverses.length > 0) {
      const universeIds = userUniverses.map((u) => u.id);
      const charRows = await tx
        .select({ id: characters.id, name: characters.name })
        .from(characters)
        .where(inArray(characters.universeId, universeIds));

      charCount = charRows.length;

      for (const char of charRows) {
        const tag = `[ANON_${shortHash(char.id)}]`;
        await tx
          .update(characters)
          .set({
            name: tag,
            traits: [tag],
            updatedAt: new Date(),
          })
          .where(eq(characters.id, char.id));
      }
    }

    // 6. Anonymize story content and purge PII fields
    const storyRows = await tx
      .select({
        id: stories.id,
        content: stories.content,
        characterNames: stories.characterNames,
      })
      .from(stories)
      .where(eq(stories.userId, userId));

    const storyCount = storyRows.length;

    for (const story of storyRows) {
      let content = story.content;
      const names: string[] = (story.characterNames as string[]) ?? [];

      // Replace each character name with [ANON] in content
      for (const name of names) {
        if (name.trim()) {
          // Escape regex special chars
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          content = content.replace(new RegExp(escaped, "gi"), "[ANON]");
        }
      }

      await tx
        .update(stories)
        .set({
          content,
          promptUsed: "",
          userGuidance: null,
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
        counts: {
          childProfiles: childCount,
          refreshTokens: tokenCount,
          characters: charCount,
          stories: storyCount,
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
      },
    } satisfies ErasureResult;
  });
}
