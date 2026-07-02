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

/** Atualiza perfil infantil — apenas do próprio responsável (guardian). */
export async function updateOwnedChildProfile(
  actor: Actor,
  id: string,
  patch: Partial<{
    nickname: string;
    ageBand: "0_3" | "4_6" | "7_9" | "10_12";
    preferences: Record<string, unknown>;
  }>,
) {
  const [row] = await db
    .update(childProfiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(childProfiles.id, id),
        eq(childProfiles.guardianId, actor.id),
        isNull(childProfiles.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/** Soft-delete de perfil infantil — apenas do próprio responsável. */
export async function softDeleteOwnedChildProfile(actor: Actor, id: string) {
  const [row] = await db
    .update(childProfiles)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(childProfiles.id, id),
        eq(childProfiles.guardianId, actor.id),
        isNull(childProfiles.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}
