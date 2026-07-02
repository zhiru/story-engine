import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { universes } from "../db/schema.js";

type Actor = { id: string; role: "USER" | "MODERATOR" | "ADMIN" };

export async function createUniverse(
  actor: Actor,
  input: {
    title: string;
    description: string;
    visibility?: "PUBLIC" | "PRIVATE" | "PAID";
  },
) {
  const [row] = await db
    .insert(universes)
    .values({ userId: actor.id, ...input })
    .returning();
  return row;
}

/** Busca universo não deletado por id. */
export async function getUniverseById(id: string) {
  const [row] = await db
    .select()
    .from(universes)
    .where(and(eq(universes.id, id), isNull(universes.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Regra de leitura de universo (SDD §6.4): dono, OU admin/moderador,
 * OU visibility='PUBLIC', OU o universo do modo SINGLE do app
 * (single_mode_universe_id resolvido pelo appContext).
 */
export function canReadUniverse(
  actor: Actor,
  universe: { id: string; userId: string; visibility: string },
  singleModeUniverseId: string | null,
): boolean {
  const isPrivileged = actor.role === "ADMIN" || actor.role === "MODERATOR";
  return (
    isPrivileged ||
    universe.userId === actor.id ||
    universe.visibility === "PUBLIC" ||
    (singleModeUniverseId !== null && universe.id === singleModeUniverseId)
  );
}

// dono OU público OU admin/moderador; nunca privado de outro usuário
export async function listVisibleUniverses(actor: Actor) {
  const isAdmin =
    actor.role === "ADMIN" || actor.role === "MODERATOR";
  return db
    .select()
    .from(universes)
    .where(
      and(
        isNull(universes.deletedAt),
        isAdmin
          ? undefined
          : or(
              eq(universes.userId, actor.id),
              eq(universes.visibility, "PUBLIC"),
            ),
      ),
    );
}
