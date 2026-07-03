import { eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}) {
  const [row] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
    })
    .returning();
  return row!;
}

export async function getUserByEmail(email: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

export async function getUserById(id: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  // filter soft-deleted
  if (!row || row.deletedAt !== null) return null;
  return row;
}
