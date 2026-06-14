import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { universes } from "../db/schema.js";

type Actor = { id: string; role: "USER" | "MODERATOR" | "ADMIN" };

export async function createUniverse(
  actor: Actor,
  input: { title: string; description: string },
) {
  const [row] = await db
    .insert(universes)
    .values({ userId: actor.id, ...input })
    .returning();
  return row;
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
