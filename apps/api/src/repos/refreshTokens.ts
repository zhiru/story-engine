import { createHash } from "crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import { db } from "../db/client.js";
import { refreshTokens } from "../db/schema.js";

export function sha256(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueRefreshToken(
  userId: string,
  token: string,
  expiresAt: Date,
) {
  const tokenHash = sha256(token);
  const [row] = await db
    .insert(refreshTokens)
    .values({ userId, tokenHash, expiresAt })
    .returning();
  return row!;
}

export async function findValidRefreshToken(userId: string, token: string) {
  const tokenHash = sha256(token);
  const now = new Date();
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.userId, userId),
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function revokeRefreshToken(id: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, id));
}
