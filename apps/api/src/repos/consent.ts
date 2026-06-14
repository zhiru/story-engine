import { and, eq } from "drizzle-orm";
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
