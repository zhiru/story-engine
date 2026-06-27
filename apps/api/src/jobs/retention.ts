/**
 * Retention purge job — physically deletes rows soft-deleted more than
 * RETENTION_DAYS (default 180) days ago. Run via: pnpm job:retention
 */
import { lt, and, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  users,
  childProfiles,
  universes,
  characters,
  themes,
  storyArcs,
  stories,
  auditLogs,
} from "../db/schema.js";

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 180);

async function main() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  console.log(`[retention] cutoff=${cutoff.toISOString()} (${RETENTION_DAYS} days)`);

  const counts: Record<string, number> = {};

  // Order matters: dependent tables first to avoid FK violations.
  const storyDel = await db
    .delete(stories)
    .where(and(isNotNull(stories.deletedAt), lt(stories.deletedAt, cutoff)))
    .returning({ id: stories.id });
  counts.stories = storyDel.length;

  const charDel = await db
    .delete(characters)
    .where(and(isNotNull(characters.deletedAt), lt(characters.deletedAt, cutoff)))
    .returning({ id: characters.id });
  counts.characters = charDel.length;

  const arcDel = await db
    .delete(storyArcs)
    .where(and(isNotNull(storyArcs.deletedAt), lt(storyArcs.deletedAt, cutoff)))
    .returning({ id: storyArcs.id });
  counts.storyArcs = arcDel.length;

  const themeDel = await db
    .delete(themes)
    .where(and(isNotNull(themes.deletedAt), lt(themes.deletedAt, cutoff)))
    .returning({ id: themes.id });
  counts.themes = themeDel.length;

  const univDel = await db
    .delete(universes)
    .where(and(isNotNull(universes.deletedAt), lt(universes.deletedAt, cutoff)))
    .returning({ id: universes.id });
  counts.universes = univDel.length;

  const childDel = await db
    .delete(childProfiles)
    .where(and(isNotNull(childProfiles.deletedAt), lt(childProfiles.deletedAt, cutoff)))
    .returning({ id: childProfiles.id });
  counts.childProfiles = childDel.length;

  const userDel = await db
    .delete(users)
    .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)))
    .returning({ id: users.id });
  counts.users = userDel.length;

  // Audit log
  await db.insert(auditLogs).values({
    actorId: null,
    action: "RETENTION_PURGE",
    targetType: "SYSTEM",
    targetId: null,
    metadata: { cutoff: cutoff.toISOString(), retentionDays: RETENTION_DAYS, counts },
  });

  console.log("[retention] purged:", counts);
  process.exit(0);
}

main().catch((err) => {
  console.error("[retention] FATAL:", err);
  process.exit(1);
});
