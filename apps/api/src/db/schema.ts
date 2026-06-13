import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const health = pgTable("health", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").notNull().default("ok"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
