import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { childProfiles } from "../db/schema.js";
import type { Actor } from "../auth/middleware.js";

export async function createChildProfile(
  actor: Actor,
  input: {
    nickname: string;
    ageBand: "0_3" | "4_6" | "7_9" | "10_12";
    preferences?: Record<string, unknown>;
  },
) {
  const [row] = await db
    .insert(childProfiles)
    .values({
      guardianId: actor.id,
      nickname: input.nickname,
      ageBand: input.ageBand,
      preferences: input.preferences ?? {},
    })
    .returning();
  return row!;
}

export async function listChildProfilesByGuardian(actor: Actor) {
  return db
    .select()
    .from(childProfiles)
    .where(
      and(
        eq(childProfiles.guardianId, actor.id),
        isNull(childProfiles.deletedAt),
      ),
    );
}

export async function getOwnedChildProfile(actor: Actor, id: string) {
  const [row] = await db
    .select()
    .from(childProfiles)
    .where(
      and(
        eq(childProfiles.id, id),
        eq(childProfiles.guardianId, actor.id),
        isNull(childProfiles.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
