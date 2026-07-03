import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { consentRecords } from "../db/schema.js";

export async function recordConsent(input: {
  userId: string;
  consentType: "PARENTAL_DATA" | "TERMS" | "MARKETING";
  policyVersion: string;
  granted: boolean;
  ipAddress?: string;
}) {
  const [row] = await db
    .insert(consentRecords)
    .values({
      userId: input.userId,
      consentType: input.consentType,
      policyVersion: input.policyVersion,
      granted: input.granted,
      ipAddress: input.ipAddress,
    })
    .returning();
  return row!;
}

export async function hasParentalConsent(
  userId: string,
  version: string,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(consentRecords)
    .where(
      and(
        eq(consentRecords.userId, userId),
        eq(consentRecords.consentType, "PARENTAL_DATA"),
        eq(consentRecords.policyVersion, version),
        eq(consentRecords.granted, true),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Consentimento parental derivado no servidor (para GET /me):
 * true se o registro PARENTAL_DATA mais recente do usuário tem granted=true
 * (uma revogação posterior — granted=false — desliga o consentimento).
 */
export async function hasParentalConsentLatest(
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ granted: consentRecords.granted })
    .from(consentRecords)
    .where(
      and(
        eq(consentRecords.userId, userId),
        eq(consentRecords.consentType, "PARENTAL_DATA"),
      ),
    )
    .orderBy(desc(consentRecords.createdAt))
    .limit(1);
  return row?.granted === true;
}
