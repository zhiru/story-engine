import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { appSettings } from "../db/schema.js";

export async function getAppSettings() {
  const [row] = await db.select().from(appSettings).limit(1);
  return row ?? null;
}

export async function getAppSettingsBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.appSlug, slug))
    .limit(1);
  return row ?? null;
}
