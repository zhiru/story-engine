import { db } from "../db/client.js";
import { appSettings } from "../db/schema.js";

export async function getAppSettings() {
  const [row] = await db.select().from(appSettings).limit(1);
  return row ?? null;
}
